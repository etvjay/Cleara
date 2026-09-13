import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DurableSnapshotStore, type CheckpointOptions, type CheckpointResult, type SerializedSliceBSnapshot } from "../../../slice-c/durable-storage/src/index.js";
import { RetryOrchestrator } from "../../../slice-c/retry-orchestration/src/index.js";
import { SourceIngestionError } from "../src/errors.js";
import { SourceBackfill, type BackfillRequest } from "../src/backfill.js";
import { DeterministicFixtureProvider } from "../src/fixture-provider.js";
import { SliceCSerializedBoundary } from "../src/slice-c-boundary.js";
import type { SerializedSliceCBoundary } from "../src/types.js";
import { blockHash, fixtureDataset, manifest, replacementDataset } from "./fixtures.js";

function request(overrides: Partial<BackfillRequest> = {}): BackfillRequest {
  return {
    scope: manifest.scopeId,
    startBlock: 10,
    endBlock: 11,
    ...overrides,
  };
}

function boundary(root: string, maxAttempts = 3): SliceCSerializedBoundary {
  return new SliceCSerializedBoundary({
    scopeId: manifest.scopeId,
    manifest,
    store: new DurableSnapshotStore(root),
    retry: new RetryOrchestrator({ defaultPolicy: { maxAttempts, initialDelayMs: 10, maxDelayMs: 20, multiplier: 2 } }),
  });
}

function sortedJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedJson);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, sortedJson(record[key])]));
  }
  return value;
}

class FailingCheckpointBoundary extends SliceCSerializedBoundary {
  private checkpointCalls = 0;

  public constructor(options: ConstructorParameters<typeof SliceCSerializedBoundary>[0], private readonly failOn = 2) {
    super(options);
  }

  public override checkpoint(...args: Parameters<SerializedSliceCBoundary["checkpoint"]>): ReturnType<SerializedSliceCBoundary["checkpoint"]> {
    this.checkpointCalls += 1;
    if (this.checkpointCalls === this.failOn) return Promise.reject(new SourceIngestionError("OUTAGE", "fixture checkpoint outage"));
    return super.checkpoint(...args);
  }
}

test("review regression: an exact duplicate rerun preserves serialized duplicate history", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-review-idempotence-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const runner = new SourceBackfill({ manifest, provider: new DeterministicFixtureProvider(fixtureDataset()), c: boundary(root) });
  await runner.run(request());
  const before = JSON.parse(runner.serializeState()) as { acceptedEvents: unknown[]; snapshot: unknown };
  const duplicate = await runner.run(request());
  assert.equal(duplicate.duplicateEvents.length, 2);
  const after = JSON.parse(runner.serializeState()) as { acceptedEvents: unknown[]; snapshot: unknown; duplicateEvents: unknown[] };
  assert.deepEqual(after.acceptedEvents, before.acceptedEvents);
  assert.deepEqual(after.snapshot, before.snapshot);
  assert.equal(after.duplicateEvents.length, 2);
  const restarted = SourceBackfill.fromSerialized({ manifest, provider: new DeterministicFixtureProvider(fixtureDataset()), c: boundary(join(root, "restart")) }, runner.serializeState());
  assert.equal(JSON.parse(restarted.serializeState()).duplicateEvents.length, 2);
});

test("review regression: accessor-backed requests fail closed before provider reads", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-review-accessor-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const runner = new SourceBackfill({ manifest, provider: new DeterministicFixtureProvider(fixtureDataset()), c: boundary(root) });
  const unsafe = request() as unknown as Record<string, unknown>;
  Object.defineProperty(unsafe, "startBlock", { enumerable: true, get: () => { throw new Error("getter must not execute"); } });
  await assert.rejects(() => runner.run(unsafe as unknown as BackfillRequest), (error: unknown) => error instanceof SourceIngestionError && error.code === "INVALID_BACKFILL_REQUEST");
});
test("review regression: D1 accepted finality never regresses below Slice B finality", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-review-finality-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  let active = new DeterministicFixtureProvider(fixtureDataset({ latestBlockNumber: 11 }));
  const provider = {
    getChainIdentity: (...args: Parameters<DeterministicFixtureProvider["getChainIdentity"]>) => active.getChainIdentity(...args),
    getLatestBlockNumber: (...args: Parameters<DeterministicFixtureProvider["getLatestBlockNumber"]>) => active.getLatestBlockNumber(...args),
    getBlockHeader: (...args: Parameters<DeterministicFixtureProvider["getBlockHeader"]>) => active.getBlockHeader(...args),
    getLogs: (...args: Parameters<DeterministicFixtureProvider["getLogs"]>) => active.getLogs(...args),
    getTransactionReceipt: (...args: Parameters<DeterministicFixtureProvider["getTransactionReceipt"]>) => active.getTransactionReceipt(...args),
  };
  const runner = new SourceBackfill({ manifest, provider, c: boundary(root) });
  await runner.run(request({ endBlock: 10 }));
  active = new DeterministicFixtureProvider(fixtureDataset({ latestBlockNumber: 12 }));
  await runner.run(request({ endBlock: 10 }));
  active = new DeterministicFixtureProvider(fixtureDataset({ latestBlockNumber: 10 }));
  await runner.run(request({ endBlock: 10 }));
  const state = JSON.parse(runner.serializeState()) as { acceptedEvents: Array<{ blockNumber: number; finalityState: string }> };
  assert.equal(state.acceptedEvents.find((item) => item.blockNumber === 10)?.finalityState, "FINALIZED");
  assert.equal(runner.readApi()?.checkpoint(manifest.chainKey)?.lastFinalizedBlock, 10n);
});


test("review regression: receipt integrity failure blocks the whole source block atomically", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-review-receipt-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const source = fixtureDataset();
  const receipt = source.receipts[0]!;
  const provider = new DeterministicFixtureProvider(source, {
    receiptOverrides: {
      [receipt.transactionHash.toLowerCase()]: { ...receipt, blockHash: blockHash(999) },
    },
  });
  const result = await new SourceBackfill({ manifest, provider, c: boundary(root) }).run(request({ endBlock: 10 }));
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.cursor.nextBlock, 10);
  assert.equal(result.completedRange, null);
  assert.equal(result.rejectedEvents.length, 0);
  assert.equal(result.providerErrors[0]?.method, "getTransactionReceipt");
  assert.equal(result.providerErrors[0]?.code, "INCONSISTENT_SOURCE_DATA");
});

test("review regression: checkpoint outage creates a durable read-only retry", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-review-checkpoint-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const c = new FailingCheckpointBoundary({
    scopeId: manifest.scopeId,
    manifest,
    store: new DurableSnapshotStore(root),
    retry: new RetryOrchestrator(),
  });
  const result = await new SourceBackfill({ manifest, provider: new DeterministicFixtureProvider(fixtureDataset()), c }).run(request({ endBlock: 10 }));
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.providerErrors[0]?.method, "checkpoint");
  assert.equal(result.retry?.disposition, "ACCEPTED");
  assert.equal(result.retryStatus, "PENDING");
});

test("review regression: initial checkpoint outage is attributed to checkpoint and retryable", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-review-initial-checkpoint-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const c = new FailingCheckpointBoundary({
    scopeId: manifest.scopeId,
    manifest,
    store: new DurableSnapshotStore(root),
    retry: new RetryOrchestrator(),
  }, 1);
  const result = await new SourceBackfill({ manifest, provider: new DeterministicFixtureProvider(fixtureDataset()), c }).run(request({ endBlock: 10 }));
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.providerErrors[0]?.method, "checkpoint");
  assert.equal(result.retry?.disposition, "ACCEPTED");
});
test("review regression: a fresh runner cannot silently ignore a supplied cursor", async (t) => {
  const firstRoot = await mkdtemp(join(tmpdir(), "cleara-d1-review-cursor-a-"));
  const secondRoot = await mkdtemp(join(tmpdir(), "cleara-d1-review-cursor-b-"));
  t.after(async () => Promise.all([
    rm(firstRoot, { recursive: true, force: true }),
    rm(secondRoot, { recursive: true, force: true }),
  ]));
  const first = await new SourceBackfill({ manifest, provider: new DeterministicFixtureProvider(fixtureDataset()), c: boundary(firstRoot) }).run(request({ endBlock: 10 }));
  const fresh = new SourceBackfill({ manifest, provider: new DeterministicFixtureProvider(fixtureDataset()), c: boundary(secondRoot) });
  await assert.rejects(() => fresh.run(request({ endBlock: 10, cursor: first.cursor })), (error: unknown) => error instanceof SourceIngestionError && error.code === "CURSOR_NOT_ADVANCED");
});


test("review regression: forged accepted state must match the public Slice B snapshot", async (t) => {
  const sourceRoot = await mkdtemp(join(tmpdir(), "cleara-d1-review-state-source-"));
  const restoreRoot = await mkdtemp(join(tmpdir(), "cleara-d1-review-state-restore-"));
  t.after(async () => Promise.all([
    rm(sourceRoot, { recursive: true, force: true }),
    rm(restoreRoot, { recursive: true, force: true }),
  ]));
  const source = new SourceBackfill({ manifest, provider: new DeterministicFixtureProvider(fixtureDataset()), c: boundary(sourceRoot) });
  await source.run(request({ endBlock: 10 }));
  const state = JSON.parse(source.serializeState()) as { acceptedEvents: Array<Record<string, unknown>> } & Record<string, unknown>;
  state.acceptedEvents[0]!.objectId = "forged-object-id";
  const forged = JSON.stringify(sortedJson(state));
  assert.throws(() => SourceBackfill.fromSerialized({ manifest, provider: new DeterministicFixtureProvider(fixtureDataset()), c: boundary(restoreRoot) }, forged), (error: unknown) => error instanceof SourceIngestionError && error.code === "MALFORMED_PROVIDER_RESPONSE");
});

test("review regression: reorged historical accepted records are marked without losing finality history", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-review-reorg-record-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  let active = new DeterministicFixtureProvider(fixtureDataset());
  const provider = {
    getChainIdentity: (...args: Parameters<DeterministicFixtureProvider["getChainIdentity"]>) => active.getChainIdentity(...args),
    getLatestBlockNumber: (...args: Parameters<DeterministicFixtureProvider["getLatestBlockNumber"]>) => active.getLatestBlockNumber(...args),
    getBlockHeader: (...args: Parameters<DeterministicFixtureProvider["getBlockHeader"]>) => active.getBlockHeader(...args),
    getLogs: (...args: Parameters<DeterministicFixtureProvider["getLogs"]>) => active.getLogs(...args),
    getTransactionReceipt: (...args: Parameters<DeterministicFixtureProvider["getTransactionReceipt"]>) => active.getTransactionReceipt(...args),
  };
  const runner = new SourceBackfill({ manifest, provider, c: boundary(root) });
  await runner.run(request({ endBlock: 10 }));
  active = new DeterministicFixtureProvider(replacementDataset());
  const result = await runner.run(request({ startBlock: 10, endBlock: 10 }));
  assert.equal(result.status, "COMPLETED");
  const state = JSON.parse(runner.serializeState()) as { acceptedEvents: Array<{ blockHash: string; finalityState: string }> };
  assert.equal(state.acceptedEvents.find((item) => item.blockHash === blockHash(10))?.finalityState, "REORGED");
});
