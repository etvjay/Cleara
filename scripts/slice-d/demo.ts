import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serializeSourceScopeManifest } from "../../workers/slice-d/source-scope/src/manifest.js";
import { DurableSnapshotStore } from "../../workers/slice-c/durable-storage/src/index.js";
import { RetryOrchestrator } from "../../workers/slice-c/retry-orchestration/src/index.js";
import {
  DeterministicFixtureProvider,
  SourceBackfill,
  SliceCSerializedBoundary,
  createFixtureDataset,
  createReplacementDataset,
  makeEvent,
  manifest,
  txHash,
} from "../../workers/slice-d/source-ingestion/src/index.js";

function request(startBlock = 10, endBlock = 11) {
  return {
    scope: manifest.scopeId,
    startBlock,
    endBlock,
    maxRange: manifest.cursor.maxRange,
    finalityPolicy: { version: manifest.finalityPolicy.version, depth: manifest.finalityPolicy.depth },
  } as const;
}

function relationship(sourceCommitmentId: string): string {
  return `relationship:fixture:capital-commitment:${sourceCommitmentId}`;
}

function boundary(root: string, maxAttempts = 3): SliceCSerializedBoundary {
  return new SliceCSerializedBoundary({
    scopeId: manifest.scopeId,
    manifest,
    store: new DurableSnapshotStore(root, { clock: () => 0 }),
    retry: new RetryOrchestrator({ defaultPolicy: { maxAttempts, initialDelayMs: 10, maxDelayMs: 20, multiplier: 2 } }),
  });
}

function switchingProvider(active: { current: DeterministicFixtureProvider }) {
  return {
    getChainIdentity: (...args: Parameters<DeterministicFixtureProvider["getChainIdentity"]>) => active.current.getChainIdentity(...args),
    getLatestBlockNumber: (...args: Parameters<DeterministicFixtureProvider["getLatestBlockNumber"]>) => active.current.getLatestBlockNumber(...args),
    getBlockHeader: (...args: Parameters<DeterministicFixtureProvider["getBlockHeader"]>) => active.current.getBlockHeader(...args),
    getLogs: (...args: Parameters<DeterministicFixtureProvider["getLogs"]>) => active.current.getLogs(...args),
    getTransactionReceipt: (...args: Parameters<DeterministicFixtureProvider["getTransactionReceipt"]>) => active.current.getTransactionReceipt(...args),
  };
}

async function main(): Promise<void> {
  const successRoot = await mkdtemp(join(tmpdir(), "cleara-d1-demo-success-"));
  const failureRoot = await mkdtemp(join(tmpdir(), "cleara-d1-demo-failure-"));
  const reorgRoot = await mkdtemp(join(tmpdir(), "cleara-d1-demo-reorg-"));
  try {
    const successBoundary = boundary(successRoot);
    const successRunner = new SourceBackfill({
      manifest,
      provider: new DeterministicFixtureProvider(createFixtureDataset()),
      c: successBoundary,
      clock: () => 0,
    });
    const success = await successRunner.run(request());
    assert.equal(success.status, "FINALITY_PENDING");
    assert.equal(success.acceptedEvents.length, 2);
    assert.equal(success.cursor.nextBlock, 12);
    assert.equal(success.finalizedHeight, 10);
    assert.equal(success.acceptedEvents[0]?.finalityState, "FINALIZED");
    assert.equal(success.acceptedEvents[1]?.finalityState, "FINALITY_PENDING");
    assert.equal(success.evidenceStatus, "PENDING_PROOF");
    assert.equal(success.reconciliationStatus, "RECONCILIATION_PENDING");
    assert.equal(success.statusMarkers.includes("OBSERVED"), true);
    assert.equal(success.statusMarkers.includes("FINALIZED"), true);
    assert.equal(success.statusMarkers.includes("PENDING_PROOF"), true);

    const recovered = await successBoundary.recover();
    assert.ok(recovered);
    const publicRead = successBoundary.read(recovered.snapshot);
    assert.equal(publicRead.health().readOnly, true);
    assert.equal(publicRead.timeline(relationship("0x" + "0".repeat(63) + "1")).length, 1);
    assert.equal(publicRead.timeline(relationship("0x" + "0".repeat(63) + "2")).length, 1);
    assert.equal(publicRead.checkpoint(manifest.chainKey)?.lastFinalizedBlock, 10n);

    const failureBoundary = boundary(failureRoot, 3);
    const failureRunner = new SourceBackfill({
      manifest,
      provider: new DeterministicFixtureProvider(createFixtureDataset(), { failures: [{ method: "getLogs", code: "OUTAGE", reason: "demo outage", remaining: 1 }] }),
      c: failureBoundary,
      clock: () => 0,
    });
    const blocked = await failureRunner.run(request(10, 10));
    assert.equal(blocked.status, "BLOCKED");
    assert.equal(blocked.cursor.nextBlock, 10);
    assert.equal(blocked.retry?.disposition, "ACCEPTED");
    const scheduled = failureRunner.executeRetry(null, 0);
    assert.equal(scheduled.outcome, "RETRY_SCHEDULED");
    const retryRestart = failureRunner.restartRetry(failureRunner.serializeRetry());
    assert.equal(retryRestart.executeRetry(null, 10).outcome, "RETRY_SCHEDULED");
    const dead = retryRestart.executeRetry(null, 30);
    assert.equal(dead.outcome, "DEAD_LETTERED");
    assert.ok(dead.job);
    assert.ok(dead.deadLetter);
    const operatorReplay = retryRestart.operatorReplay(dead.job!.id);
    assert.equal(operatorReplay.status, "PENDING");
    assert.equal(retryRestart.executeRetry({ read: () => ({ outcome: "success", receipt: { readOnly: true } }) }, 0).outcome, "COMPLETED");

    const active = { current: new DeterministicFixtureProvider(createFixtureDataset({ events: [makeEvent({ blockNumber: 10, transactionHash: txHash(10) })] })) };
    const reorgBoundary = boundary(reorgRoot);
    const reorgRunner = new SourceBackfill({ manifest, provider: switchingProvider(active), c: reorgBoundary, clock: () => 0 });
    await reorgRunner.run(request(10, 10));
    active.current = new DeterministicFixtureProvider(createReplacementDataset());
    const reorg = await reorgRunner.run(request(10, 10));
    assert.equal(reorg.status, "COMPLETED");
    assert.equal(reorg.replayStatus, "CURRENT");
    assert.equal(reorg.statusMarkers.includes("REORG_DETECTED"), true);
    assert.equal(reorg.replayHistory.length >= 1, true);

    console.log(JSON.stringify({
      schemaVersion: "slice-d-demo-v1",
      mode: manifest.mode,
      scope: manifest.scopeId,
      manifestHash: serializeSourceScopeManifest(manifest).hash,
      success: { status: success.status, accepted: success.acceptedEvents.length, finalizedHeight: success.finalizedHeight, restarted: true },
      failureRecovery: { blockedCursor: blocked.cursor.nextBlock, retry: scheduled.outcome, deadLetter: dead.outcome, operatorReplay: operatorReplay.status },
      reorg: { status: reorg.status, replayStatus: reorg.replayStatus, replayAttempts: reorg.replayHistory.length },
      limitations: ["fixture-only", "read-only", "proof pending", "no live provider", "no financial authority"],
    }, null, 2));
  } finally {
    await Promise.all([
      rm(successRoot, { recursive: true, force: true }),
      rm(failureRoot, { recursive: true, force: true }),
      rm(reorgRoot, { recursive: true, force: true }),
    ]);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
