import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSliceBApi } from "../../../multichain-execution/src/api.js";
import { restoreSnapshot } from "../../../multichain-execution/src/slice-b.js";
import { DurableSnapshotStore } from "../../../slice-c/durable-storage/src/index.js";
import { RetryOrchestrator, type ReadOnlyProvider } from "../../../slice-c/retry-orchestration/src/index.js";
import { SourceIngestionError } from "../src/errors.js";
import { SourceBackfill, type BackfillRequest } from "../src/backfill.js";
import { DeterministicFixtureProvider } from "../src/fixture-provider.js";
import { SerializedSliceCBoundary } from "../src/slice-c-boundary.js";
import { defaultEvents, fixtureDataset, hexWord, makeEvent, manifest, replacementDataset, replacementDatasetMultiple, replacementDatasetTwoBlocks, secondProviderAddress } from "./fixtures.js";

function request(overrides: Partial<BackfillRequest> = {}): BackfillRequest {
  return {
    scope: manifest.scopeId,
    startBlock: 10,
    endBlock: 11,
    ...overrides,
  };
}

async function boundary(root: string, maxAttempts = 3): Promise<SerializedSliceCBoundary> {
  return new SerializedSliceCBoundary({
    scopeId: manifest.scopeId,
    manifest,
    store: new DurableSnapshotStore(root),
    retry: new RetryOrchestrator({ defaultPolicy: { maxAttempts, initialDelayMs: 10, maxDelayMs: 20, multiplier: 2 } }),
  });
}

test("backfill accepts finalized fixture events, persists B through C, and survives restart", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-happy-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const c = await boundary(root);
  const runner = new SourceBackfill({ manifest, provider: new DeterministicFixtureProvider(fixtureDataset()), c });

  const result = await runner.run(request());

  assert.equal(result.status, "FINALITY_PENDING");
  assert.equal(result.acceptedEvents.length, 2);
  assert.equal(result.rejectedEvents.length, 0);
  assert.equal(result.duplicateEvents.length, 0);
  assert.equal(result.cursor.nextBlock, 12);
  assert.equal(result.cursor.lastCompletedBlock, 11);
  assert.equal(result.observedHeight, 11);
  assert.equal(result.finalizedHeight, 10);
  assert.equal(result.replayStatus, "CURRENT");
  assert.deepEqual(result.statusMarkers, ["OBSERVED", "FINALITY_PENDING", "FINALIZED", "PENDING_PROOF", "RECONCILIATION_PENDING"]);
  assert.equal(result.evidenceStatus, "PENDING_PROOF");
  assert.equal(result.reconciliationStatus, "RECONCILIATION_PENDING");
  assert.equal(result.responsibleRole, "source-ingestion-operator");
  assert.match(result.nextAction, /proof|finality/i);
  assert.ok(result.snapshot);

  const recovered = await c.recover();
  assert.ok(recovered);
  assert.equal(recovered.snapshot.hash, result.snapshot!.hash);
  const publicRead = c.read(recovered.snapshot);
  assert.equal(publicRead.health().readOnly, true);
  assert.equal(publicRead.timeline("relationship:fixture:capital-commitment:0x" + "0".repeat(63) + "1").length, 1);
  assert.equal(publicRead.checkpoint(1)?.lastFinalizedBlock, 10n);
  assert.equal(publicRead.checkpoint(1)?.replayStatus, "CURRENT");
});

test("overlapping and reordered fixture reads are deterministic and idempotent", async (t) => {
  const firstRoot = await mkdtemp(join(tmpdir(), "cleara-d1-order-a-"));
  const secondRoot = await mkdtemp(join(tmpdir(), "cleara-d1-order-b-"));
  t.after(async () => Promise.all([
    rm(firstRoot, { recursive: true, force: true }),
    rm(secondRoot, { recursive: true, force: true }),
  ]));

  const firstRunner = new SourceBackfill({ manifest, provider: new DeterministicFixtureProvider(fixtureDataset()), c: await boundary(firstRoot) });
  const first = await firstRunner.run(request());
  const overlap = await firstRunner.run(request({ startBlock: 10, endBlock: 11 }));
  assert.equal(overlap.snapshot!.hash, first.snapshot!.hash);
  assert.equal(overlap.acceptedEvents.length, 0);
  assert.equal(overlap.duplicateEvents.length, 2);

  const reverseEvents = [...defaultEvents()].reverse();
  const reversedDataset = { ...fixtureDataset(), logs: reverseEvents.map((event) => event.log), receipts: reverseEvents.map((event) => event.receipt).reverse() };
  const secondRunner = new SourceBackfill({ manifest, provider: new DeterministicFixtureProvider(reversedDataset), c: await boundary(secondRoot) });
  const second = await secondRunner.run(request());
  assert.equal(second.snapshot!.hash, first.snapshot!.hash);
  assert.deepEqual(second.acceptedEvents.map((event) => event.eventId), first.acceptedEvents.map((event) => event.eventId));
});

test("backfill rejects unsafe, reversed, oversized, and wrong-scope requests", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-request-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const runner = new SourceBackfill({ manifest, provider: new DeterministicFixtureProvider(fixtureDataset()), c: await boundary(root) });
  const cases: Array<[string, Partial<BackfillRequest>, SourceIngestionError["code"]]> = [
    ["wrong scope", { scope: "other-scope" }, "UNSUPPORTED_SCOPE"],
    ["reversed", { startBlock: 11, endBlock: 10 }, "INVALID_BACKFILL_REQUEST"],
    ["oversized", { startBlock: 1, endBlock: 1002 }, "INVALID_BACKFILL_REQUEST"],
    ["fractional", { startBlock: 10.5 }, "INVALID_BACKFILL_REQUEST"],
    ["negative", { startBlock: -1 }, "INVALID_BACKFILL_REQUEST"],
    ["unsafe", { endBlock: Number.MAX_SAFE_INTEGER }, "INVALID_BACKFILL_REQUEST"],
  ];
  for (const [, overrides, code] of cases) {
    await assert.rejects(() => runner.run(request(overrides)), (error: unknown) => error instanceof SourceIngestionError && error.code === code);
  }
});

test("provider outage leaves the cursor at the last safe block and submits a bounded retry", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-outage-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const provider = new DeterministicFixtureProvider(fixtureDataset(), {
    failures: [{ method: "getLogs", code: "OUTAGE", reason: "fixture outage", remaining: 1 }],
  });
  const c = await boundary(root);
  const runner = new SourceBackfill({ manifest, provider, c });

  const blocked = await runner.run(request({ endBlock: 10 }));
  assert.equal(blocked.status, "BLOCKED");
  assert.equal(blocked.cursor.nextBlock, 10);
  assert.equal(blocked.cursor.lastCompletedBlock, 9);
  assert.equal(blocked.providerErrors[0]?.code, "OUTAGE");
  assert.equal(blocked.retry?.disposition, "ACCEPTED");

  const recovered = await runner.run(request({ endBlock: 10 }));
  assert.equal(recovered.status, "COMPLETED");
  assert.equal(recovered.cursor.nextBlock, 11);
  assert.equal(recovered.acceptedEvents.length, 1);

  const scheduled = runner.executeRetry(null, 0);
  assert.equal(scheduled.outcome, "RETRY_SCHEDULED");
  const retryState = runner.serializeRetry();
  const restarted = runner.restartRetry(retryState);
  const completed = restarted.executeRetry({ read: () => ({ outcome: "success", receipt: { readOnly: true } }) }, 10);
  assert.equal(completed.outcome, "COMPLETED");
});

test("a later-block outage keeps the prior checkpoint and targets the failed block", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-atomic-cursor-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const base = new DeterministicFixtureProvider(fixtureDataset());
  let logReads = 0;
  const provider = {
    getChainIdentity: async (scope: Parameters<DeterministicFixtureProvider["getChainIdentity"]>[0]) => base.getChainIdentity(scope),
    getLatestBlockNumber: async (scope: Parameters<DeterministicFixtureProvider["getLatestBlockNumber"]>[0]) => base.getLatestBlockNumber(scope),
    getBlockHeader: async (scope: Parameters<DeterministicFixtureProvider["getBlockHeader"]>[0], blockNumber: number) => base.getBlockHeader(scope, blockNumber),
    getLogs: async (scope: Parameters<DeterministicFixtureProvider["getLogs"]>[0], filter: Parameters<DeterministicFixtureProvider["getLogs"]>[1]) => {
      logReads += 1;
      if (logReads === 2) throw new SourceIngestionError("OUTAGE", "second block fixture outage");
      return base.getLogs(scope, filter);
    },
    getTransactionReceipt: async (scope: Parameters<DeterministicFixtureProvider["getTransactionReceipt"]>[0], transactionHash: string) => base.getTransactionReceipt(scope, transactionHash),
  };
  const runner = new SourceBackfill({ manifest, provider, c: await boundary(root) });
  const result = await runner.run(request());
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.cursor.nextBlock, 11);
  assert.equal(result.completedRange?.endBlock, 10);
  assert.equal(result.acceptedEvents.length, 1);
  assert.equal(result.providerErrors[0]?.method, "getLogs");
  assert.match(runner.retrySnapshot().jobs[0]?.deliveryIds[0] ?? "", /:11$/);
});

test("earlier replacement uses Slice B replay semantics and reaches current only after finality", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-reorg-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  let active = new DeterministicFixtureProvider(fixtureDataset({ events: [makeEvent({ blockNumber: 10, transactionHash: "0x" + "aa".repeat(32), sourceCommitmentId: "0x" + "01".repeat(32) })] }));
  const switchingProvider = {
    getChainIdentity: (...args: Parameters<DeterministicFixtureProvider["getChainIdentity"]>) => active.getChainIdentity(...args),
    getLatestBlockNumber: (...args: Parameters<DeterministicFixtureProvider["getLatestBlockNumber"]>) => active.getLatestBlockNumber(...args),
    getBlockHeader: (...args: Parameters<DeterministicFixtureProvider["getBlockHeader"]>) => active.getBlockHeader(...args),
    getLogs: (...args: Parameters<DeterministicFixtureProvider["getLogs"]>) => active.getLogs(...args),
    getTransactionReceipt: (...args: Parameters<DeterministicFixtureProvider["getTransactionReceipt"]>) => active.getTransactionReceipt(...args),
  };
  const runner = new SourceBackfill({ manifest, provider: switchingProvider, c: await boundary(root) });
  await runner.run(request({ endBlock: 10 }));

  active = new DeterministicFixtureProvider(replacementDataset());
  const replay = await runner.run(request({ startBlock: 10, endBlock: 10 }));
  assert.equal(replay.replayStatus, "CURRENT");
  assert.equal(replay.cursor.nextBlock, 11);
  assert.equal(replay.replayHistory.length >= 1, true);
  assert.equal(replay.snapshot!.body.includes("REPLAY_REQUIRED"), false);
});

test("malformed provider responses are typed and cannot advance the cursor", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-malformed-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const provider = new DeterministicFixtureProvider(fixtureDataset(), { logsOverride: [null] });
  const runner = new SourceBackfill({ manifest, provider, c: await boundary(root) });
  const result = await runner.run(request({ endBlock: 10 }));
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.cursor.nextBlock, 10);
  assert.equal(result.rejectedEvents.length, 0);
  assert.equal(result.providerErrors[0]?.code, "MALFORMED_PROVIDER_RESPONSE");
});

test("replay-required handoff remains explicit and retry success cannot promote the projection", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-replay-handoff-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  let active = new DeterministicFixtureProvider(fixtureDataset({ events: [makeEvent({ blockNumber: 10, transactionHash: "0x" + "aa".repeat(32), sourceCommitmentId: "0x" + "01".repeat(32) })] }));
  const switchingProvider = {
    getChainIdentity: (...args: Parameters<DeterministicFixtureProvider["getChainIdentity"]>) => active.getChainIdentity(...args),
    getLatestBlockNumber: (...args: Parameters<DeterministicFixtureProvider["getLatestBlockNumber"]>) => active.getLatestBlockNumber(...args),
    getBlockHeader: (...args: Parameters<DeterministicFixtureProvider["getBlockHeader"]>) => active.getBlockHeader(...args),
    getLogs: (...args: Parameters<DeterministicFixtureProvider["getLogs"]>) => active.getLogs(...args),
    getTransactionReceipt: (...args: Parameters<DeterministicFixtureProvider["getTransactionReceipt"]>) => active.getTransactionReceipt(...args),
  };
  const c = await boundary(root);
  const runner = new SourceBackfill({ manifest, provider: switchingProvider, c, autoReplay: false });
  await runner.run(request({ endBlock: 10 }));

  active = new DeterministicFixtureProvider(replacementDataset());
  const result = await runner.run(request({ startBlock: 10, endBlock: 10 }));
  assert.equal(result.replayStatus, "REPLAY_REQUIRED");
  const handoff = runner.submitReplayHandoff("delivery:replay-required");
  assert.equal(handoff.disposition, "ACCEPTED");
  assert.equal(runner.executeRetry(null, 0).outcome, "HANDOFF_EMITTED");
  assert.equal((await c.recover())?.snapshot.body.includes("REPLAY_REQUIRED"), true);
  assert.equal(result.reconciliationStatus, "RECONCILIATION_PENDING");
});

test("sparse no-event ranges advance the cursor without inventing observed events", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-sparse-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const runner = new SourceBackfill({ manifest, provider: new DeterministicFixtureProvider(fixtureDataset({ events: [] })), c: await boundary(root) });
  const result = await runner.run(request({ endBlock: 12 }));
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.acceptedEvents.length, 0);
  assert.equal(result.cursor.nextBlock, 13);
  assert.equal(runner.readApi()?.health().readOnly, true);
  assert.equal(runner.readApi()?.checkpoint(1)?.lastObservedBlock, 12n);
});

test("finality is monotonic across lower, equal, and higher provider heights", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-finality-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  let active = new DeterministicFixtureProvider(fixtureDataset({ latestBlockNumber: 11, events: [makeEvent({ blockNumber: 10 })] }));
  const switchingProvider = {
    getChainIdentity: (...args: Parameters<DeterministicFixtureProvider["getChainIdentity"]>) => active.getChainIdentity(...args),
    getLatestBlockNumber: (...args: Parameters<DeterministicFixtureProvider["getLatestBlockNumber"]>) => active.getLatestBlockNumber(...args),
    getBlockHeader: (...args: Parameters<DeterministicFixtureProvider["getBlockHeader"]>) => active.getBlockHeader(...args),
    getLogs: (...args: Parameters<DeterministicFixtureProvider["getLogs"]>) => active.getLogs(...args),
    getTransactionReceipt: (...args: Parameters<DeterministicFixtureProvider["getTransactionReceipt"]>) => active.getTransactionReceipt(...args),
  };
  const runner = new SourceBackfill({ manifest, provider: switchingProvider, c: await boundary(root) });
  const pending = await runner.run(request({ endBlock: 10 }));
  assert.equal(pending.finalizedHeight, 9);
  assert.equal(pending.acceptedEvents[0]?.finalityState, "FINALITY_PENDING");

  active = new DeterministicFixtureProvider(fixtureDataset({ latestBlockNumber: 12, events: [makeEvent({ blockNumber: 10 })] }));
  const finalized = await runner.run(request({ endBlock: 10 }));
  assert.equal(finalized.finalizedHeight, 10);
  assert.equal(finalized.acceptedEvents.length, 0);

  active = new DeterministicFixtureProvider(fixtureDataset({ latestBlockNumber: 10, events: [makeEvent({ blockNumber: 10 })] }));
  const lower = await runner.run(request({ endBlock: 10 }));
  assert.equal(lower.finalizedHeight, 10);
  assert.equal(runner.readApi()?.checkpoint(1)?.lastFinalizedBlock, 10n);
});

test("missing receipts block the current unit and do not move its cursor", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-receipt-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const source = fixtureDataset();
  const provider = new DeterministicFixtureProvider({ ...source, receipts: [] });
  const result = await new SourceBackfill({ manifest, provider, c: await boundary(root) }).run(request({ endBlock: 10 }));
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.cursor.nextBlock, 10);
  assert.equal(result.providerErrors[0]?.method, "getTransactionReceipt");
  assert.equal(result.providerErrors[0]?.code, "NOT_FOUND");
});

test("maximum legal range is accepted while an unavailable fixture block remains recoverably blocked", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-max-range-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const runner = new SourceBackfill({ manifest, provider: new DeterministicFixtureProvider(fixtureDataset()), c: await boundary(root) });
  const result = await runner.run(request({ startBlock: 10, endBlock: 1009, maxRange: 1000 }));
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.providerErrors[0]?.code, "NOT_FOUND");
  assert.equal(result.cursor.nextBlock, 13);
});

test("conflicting repeated source identity is rejected without changing the B graph", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-conflict-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const original = makeEvent({ blockNumber: 10, amount: 1_000_000n });
  const conflicting = makeEvent({ blockNumber: 10, amount: 2_000_000n, transactionHash: original.log.transactionHash });
  let active = new DeterministicFixtureProvider(fixtureDataset({ events: [original] }));
  const switchingProvider = {
    getChainIdentity: (...args: Parameters<DeterministicFixtureProvider["getChainIdentity"]>) => active.getChainIdentity(...args),
    getLatestBlockNumber: (...args: Parameters<DeterministicFixtureProvider["getLatestBlockNumber"]>) => active.getLatestBlockNumber(...args),
    getBlockHeader: (...args: Parameters<DeterministicFixtureProvider["getBlockHeader"]>) => active.getBlockHeader(...args),
    getLogs: (...args: Parameters<DeterministicFixtureProvider["getLogs"]>) => active.getLogs(...args),
    getTransactionReceipt: (...args: Parameters<DeterministicFixtureProvider["getTransactionReceipt"]>) => active.getTransactionReceipt(...args),
  };
  const runner = new SourceBackfill({ manifest, provider: switchingProvider, c: await boundary(root) });
  const first = await runner.run(request({ endBlock: 10 }));
  active = new DeterministicFixtureProvider(fixtureDataset({ events: [conflicting] }));
  const second = await runner.run(request({ endBlock: 10 }));
  assert.equal(second.status, "REJECTED");
  assert.equal(second.rejectedEvents[0]?.code, "CONFLICTING_IDENTITY");
  assert.equal(runner.readApi()?.timeline(first.acceptedEvents[0]!.relationshipId).length, 1);
});

test("backfill state serializes and restores the cursor, dedupe set, and B snapshot", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-state-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const firstRunner = new SourceBackfill({ manifest, provider: new DeterministicFixtureProvider(fixtureDataset()), c: await boundary(root) });
  const first = await firstRunner.run(request());
  const serialized = firstRunner.serializeState();
  const restored = SourceBackfill.fromSerialized({ manifest, provider: new DeterministicFixtureProvider(fixtureDataset()), c: await boundary(root) }, serialized);
  assert.equal(restored.stateHash(), firstRunner.stateHash());
  const overlap = await restored.run(request());
  assert.equal(overlap.snapshot!.hash, first.snapshot!.hash);
  assert.equal(overlap.duplicateEvents.length, 2);
});

test("multi-block replay refreshes the next target after the first replacement", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-multi-target-replay-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const originalEvents = [makeEvent({ blockNumber: 10, sourceCommitmentId: hexWord(1) }), makeEvent({ blockNumber: 11, sourceCommitmentId: hexWord(2), provider: secondProviderAddress, logIndex: 1 })];
  let active = new DeterministicFixtureProvider(fixtureDataset({ latestBlockNumber: 13, events: originalEvents }));
  const switchingProvider = {
    getChainIdentity: async (scope: Parameters<DeterministicFixtureProvider["getChainIdentity"]>[0]) => active.getChainIdentity(scope),
    getLatestBlockNumber: async (scope: Parameters<DeterministicFixtureProvider["getLatestBlockNumber"]>[0]) => active.getLatestBlockNumber(scope),
    getBlockHeader: async (scope: Parameters<DeterministicFixtureProvider["getBlockHeader"]>[0], blockNumber: number) => active.getBlockHeader(scope, blockNumber),
    getLogs: async (scope: Parameters<DeterministicFixtureProvider["getLogs"]>[0], filter: Parameters<DeterministicFixtureProvider["getLogs"]>[1]) => active.getLogs(scope, filter),
    getTransactionReceipt: async (scope: Parameters<DeterministicFixtureProvider["getTransactionReceipt"]>[0], transactionHash: string) => active.getTransactionReceipt(scope, transactionHash),
  };
  const runner = new SourceBackfill({ manifest, provider: switchingProvider, c: await boundary(root) });
  const initial = await runner.run(request({ endBlock: 11 }));
  assert.equal(initial.status, "COMPLETED");

  active = new DeterministicFixtureProvider(replacementDatasetTwoBlocks());
  const replaced = await runner.run(request({ endBlock: 11 }));
  assert.equal(replaced.status, "COMPLETED");
  assert.equal(replaced.replayStatus, "CURRENT");
  assert.equal(replaced.replayTargets.length, 0);
  assert.equal(replaced.replayHistory.filter((attempt) => attempt.status === "SUCCEEDED").length, 2);
});

test("backfill preserves multiple events in one replacement block", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-multi-reorg-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  let active = new DeterministicFixtureProvider(fixtureDataset({ events: [makeEvent({ blockNumber: 10 })] }));
  const switchingProvider = {
    getChainIdentity: (...args: Parameters<DeterministicFixtureProvider["getChainIdentity"]>) => active.getChainIdentity(...args),
    getLatestBlockNumber: (...args: Parameters<DeterministicFixtureProvider["getLatestBlockNumber"]>) => active.getLatestBlockNumber(...args),
    getBlockHeader: (...args: Parameters<DeterministicFixtureProvider["getBlockHeader"]>) => active.getBlockHeader(...args),
    getLogs: (...args: Parameters<DeterministicFixtureProvider["getLogs"]>) => active.getLogs(...args),
    getTransactionReceipt: (...args: Parameters<DeterministicFixtureProvider["getTransactionReceipt"]>) => active.getTransactionReceipt(...args),
  };
  const runner = new SourceBackfill({ manifest, provider: switchingProvider, c: await boundary(root) });
  await runner.run(request({ endBlock: 10 }));
  active = new DeterministicFixtureProvider(replacementDatasetMultiple());
  const result = await runner.run(request({ startBlock: 10, endBlock: 10 }));
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.acceptedEvents.length, 2);
  assert.equal(result.replayStatus, "CURRENT");
  assert.equal(runner.readApi()?.timeline("relationship:fixture:capital-commitment:" + "0x" + "0".repeat(63) + "3").length, 1);
  assert.equal(runner.readApi()?.timeline("relationship:fixture:capital-commitment:" + "0x" + "0".repeat(63) + "4").length, 1);
});

test("missing trusted history remains replay-required instead of self-trusting a replacement", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-missing-history-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const initial = new SourceBackfill({ manifest, provider: new DeterministicFixtureProvider(fixtureDataset({ events: [makeEvent({ blockNumber: 10 })] })), c: await boundary(root) });
  await initial.run(request({ endBlock: 10 }));
  const state = JSON.parse(initial.serializeState()) as { snapshot: { hash: string; body: string }; cursor: unknown; acceptedEvents: unknown[]; rejectedEvents: unknown[]; duplicateEvents: unknown[]; providerErrors: unknown[]; schemaVersion: string; manifestHash: string };
  const body = JSON.parse(state.snapshot.body) as Record<string, unknown>;
  body.blockHistory = [];
  const sorted = (value: unknown): unknown => Array.isArray(value) ? value.map(sorted) : value !== null && typeof value === "object" ? Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, sorted((value as Record<string, unknown>)[key])] )) : value;
  const modifiedSnapshot = createSliceBApi(restoreSnapshot(JSON.stringify(sorted(body)))).serializeSnapshot();
  state.snapshot = modifiedSnapshot;
  const runner = SourceBackfill.fromSerialized({ manifest, provider: new DeterministicFixtureProvider(replacementDataset()), c: await boundary(root) }, JSON.stringify(sorted(state)));
  const result = await runner.run(request({ startBlock: 10, endBlock: 10 }));
  assert.equal(result.status, "REPLAY_REQUIRED");
  assert.equal(result.replayStatus, "REPLAY_REQUIRED");
  assert.equal(result.replayHistory.some((attempt) => attempt.status === "BLOCKED"), true);
  assert.equal(result.replayTargets[0]?.blockNumber, "10");
  assert.equal(result.replayTargets[0]?.oldBlockHash, null);
  assert.equal(result.replayRecoveryRole, "projection operator");
  assert.match(result.nextAction, /trusted history/i);
});

test("replacement with an untrusted parent cannot advance the cursor or become current", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-bad-parent-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const replacement = replacementDataset();
  const badBlocks = replacement.blocks.map((block) => block.blockNumber === 10 ? { ...block, parentHash: "0x" + "88".repeat(32) } : block);
  const result = await new SourceBackfill({ manifest, provider: new DeterministicFixtureProvider({ ...replacement, blocks: badBlocks }), c: await boundary(root) }).run(request({ endBlock: 10 }));
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.cursor.nextBlock, 10);
  assert.equal(result.providerErrors[0]?.code, "MISSING_TRUSTED_HISTORY");
  assert.notEqual(result.snapshot, null);
  assert.equal(result.snapshot!.body.includes("c010"), false);
});

test("provider retry exhausts to a dead letter and requires explicit operator replay", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-dead-letter-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const runner = new SourceBackfill({
    manifest,
    provider: new DeterministicFixtureProvider(fixtureDataset(), { failures: [{ method: "getLogs", code: "OUTAGE", reason: "persistent fixture outage", remaining: 1 }] }),
    c: await boundary(root, 2),
  });
  const blocked = await runner.run(request({ endBlock: 10 }));
  assert.equal(blocked.retryStatus, "PENDING");
  const first = runner.executeRetry(null, 0);
  assert.equal(first.outcome, "RETRY_SCHEDULED");
  const restarted = runner.restartRetry(runner.serializeRetry());
  const dead = restarted.executeRetry(null, 10);
  assert.equal(dead.outcome, "DEAD_LETTERED");
  assert.ok(dead.job);
  assert.ok(dead.deadLetter);
  assert.equal(restarted.retrySnapshot().deadLetters.length, 1);
  assert.equal(restarted.status()?.retryStatus, "DEAD_LETTERED");
  const replayed = restarted.operatorReplay(dead.job!.id);
  assert.equal(replayed.status, "PENDING");
  const completed = restarted.executeRetry({ read: () => ({ outcome: "success", receipt: { readOnly: true } }) }, 0);
  assert.equal(completed.outcome, "COMPLETED");
  assert.equal(restarted.status()?.retryStatus, "COMPLETED");
});

test("a replacement ingested before finality replays when a later overlap reaches finality", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-replay-liveness-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  let active = new DeterministicFixtureProvider(fixtureDataset());
  const switchingProvider = {
    getChainIdentity: async (scope: Parameters<DeterministicFixtureProvider["getChainIdentity"]>[0]) => active.getChainIdentity(scope),
    getLatestBlockNumber: async (scope: Parameters<DeterministicFixtureProvider["getLatestBlockNumber"]>[0]) => active.getLatestBlockNumber(scope),
    getBlockHeader: async (scope: Parameters<DeterministicFixtureProvider["getBlockHeader"]>[0], blockNumber: number) => active.getBlockHeader(scope, blockNumber),
    getLogs: async (scope: Parameters<DeterministicFixtureProvider["getLogs"]>[0], filter: Parameters<DeterministicFixtureProvider["getLogs"]>[1]) => active.getLogs(scope, filter),
    getTransactionReceipt: async (scope: Parameters<DeterministicFixtureProvider["getTransactionReceipt"]>[0], transactionHash: string) => active.getTransactionReceipt(scope, transactionHash),
  };
  const runner = new SourceBackfill({ manifest, provider: switchingProvider, c: await boundary(root) });
  const initial = await runner.run({ scope: manifest.scopeId, startBlock: 10, endBlock: 10 });
  assert.equal(initial.replayStatus, "CURRENT");

  active = new DeterministicFixtureProvider({ ...replacementDataset(), latestBlockNumber: 11 });
  const pending = await runner.run({ scope: manifest.scopeId, startBlock: 10, endBlock: 10 });
  assert.equal(pending.status, "REPLAY_REQUIRED");
  assert.equal(pending.acceptedEvents.length, 1);
  const pendingState = JSON.parse(runner.serializeState()) as { acceptedEvents: Array<{ blockHash: string; finalityState: string }> };
  assert.equal(pendingState.acceptedEvents.find((event) => event.blockHash === hexWord(0xc010))?.finalityState, "FINALITY_PENDING");

  active = new DeterministicFixtureProvider(replacementDataset());
  const completed = await runner.run({ scope: manifest.scopeId, startBlock: 10, endBlock: 10 });
  assert.equal(completed.status, "COMPLETED");
  assert.equal(completed.replayStatus, "CURRENT");
  assert.equal(completed.acceptedEvents.length, 0);
  assert.equal(completed.duplicateEvents.length, 1);
  assert.equal(completed.replayHistory.some((attempt) => attempt.status === "SUCCEEDED"), true);
});

test("stale or cross-scope cursors are rejected before provider reads", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-cursor-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const runner = new SourceBackfill({ manifest, provider: new DeterministicFixtureProvider(fixtureDataset()), c: await boundary(root) });
  const first = await runner.run(request({ endBlock: 10 }));
  await assert.rejects(() => runner.run(request({ endBlock: 11, cursor: { ...first.cursor, nextBlock: 10 } })), (error: unknown) => error instanceof SourceIngestionError && error.code === "CURSOR_NOT_ADVANCED");
  await assert.rejects(() => runner.run(request({ endBlock: 11, cursor: { ...first.cursor, scope: "source-scope:other" } })), (error: unknown) => error instanceof SourceIngestionError && error.code === "INVALID_BACKFILL_REQUEST");
});
