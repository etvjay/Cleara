import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSliceBApi } from "../../../multichain-execution/src/api.js";
import { restoreSnapshot } from "../../../multichain-execution/src/slice-b.js";
import test from "node:test";
import { parseSourceScopeManifest } from "../../source-scope/src/manifest.js";
import { DurableSnapshotStore } from "../../../slice-c/durable-storage/src/index.js";
import { RetryOrchestrator } from "../../../slice-c/retry-orchestration/src/index.js";
import { CapitalCommittedAdapter } from "../src/adapter.js";
import { SourceIngestionError } from "../src/errors.js";
import { DeterministicFixtureProvider } from "../src/fixture-provider.js";
import { SourceBackfill } from "../src/backfill.js";
import { SerializedSliceCBoundary } from "../src/slice-c-boundary.js";
import { SliceBSerializedBoundary } from "../src/slice-b-boundary.js";
import { fixtureDataset, blockHash, hexWord, makeBlock, makeEvent, manifest, manifestCopy, replacementDataset, txHash } from "./fixtures.js";

function request(startBlock = 10, endBlock = 10) {
  return { scope: manifest.scopeId, startBlock, endBlock };
}

async function boundary(root: string): Promise<SerializedSliceCBoundary> {
  return new SerializedSliceCBoundary({
    scopeId: manifest.scopeId,
    manifest,
    store: new DurableSnapshotStore(root),
    retry: new RetryOrchestrator({ defaultPolicy: { maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 20, multiplier: 2 } }),
  });
}

async function validBundle() {
  const provider = new DeterministicFixtureProvider(fixtureDataset());
  const block = await provider.getBlockHeader(manifest, 10);
  const parent = await provider.getBlockHeader(manifest, 9);
  const logs = await provider.getLogs(manifest, { address: manifest.contract.address, topic0: manifest.eventFamily.selector, fromBlock: 10, toBlock: 10 });
  const receipt = await provider.getTransactionReceipt(manifest, logs[0]!.transactionHash);
  return { identity: await provider.getChainIdentity(manifest), block, parent, log: logs[0], receipt };
}

function expectManifestCode(run: () => unknown, code: string): void {
  assert.throws(run, (error: unknown) => error instanceof Error && error.message.startsWith(`${code}:`));
}

function expectCode(run: () => unknown, code: SourceIngestionError["code"]): void {
  assert.throws(run, (error: unknown) => error instanceof SourceIngestionError && error.code === code);
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, canonical((value as Record<string, unknown>)[key])]));
  }
  return value;
}

function mutateSnapshot(serialized: string, mutate: (value: Record<string, unknown>) => void): string {
  const state = JSON.parse(serialized) as Record<string, any>;
  const snapshot = state.snapshot as { body: string; hash: string };
  const bodyValue = JSON.parse(snapshot.body) as Record<string, unknown>;
  mutate(bodyValue);
  const body = JSON.stringify(canonical(bodyValue));
  const normalizedSnapshot = createSliceBApi(restoreSnapshot(body)).serializeSnapshot();
  state.snapshot = normalizedSnapshot;
  return JSON.stringify(canonical(state));
}

function findObject(value: unknown, predicate: (candidate: Record<string, unknown>) => boolean): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findObject(item, predicate);
      if (found) return found;
    }
    return null;
  }
  if (value === null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (predicate(record)) return record;
  for (const child of Object.values(record)) {
    const found = findObject(child, predicate);
    if (found) return found;
  }
  return null;
}

function switchingProvider(active: { current: DeterministicFixtureProvider }) {
  return {
    getChainIdentity: (scope: Parameters<DeterministicFixtureProvider["getChainIdentity"]>[0]) => active.current.getChainIdentity(scope),
    getLatestBlockNumber: (scope: Parameters<DeterministicFixtureProvider["getLatestBlockNumber"]>[0]) => active.current.getLatestBlockNumber(scope),
    getBlockHeader: (scope: Parameters<DeterministicFixtureProvider["getBlockHeader"]>[0], blockNumber: number) => active.current.getBlockHeader(scope, blockNumber),
    getLogs: (scope: Parameters<DeterministicFixtureProvider["getLogs"]>[0], filter: Parameters<DeterministicFixtureProvider["getLogs"]>[1]) => active.current.getLogs(scope, filter),
    getTransactionReceipt: (scope: Parameters<DeterministicFixtureProvider["getTransactionReceipt"]>[0], transactionHash: string) => active.current.getTransactionReceipt(scope, transactionHash),
  };
}

test("review 2: manifest rejects hidden and symbol root fields", () => {
  const hidden = manifestCopy() as unknown as Record<string, unknown>;
  Object.defineProperty(hidden, "hiddenPoison", { value: "poison", enumerable: false });
  expectManifestCode(() => parseSourceScopeManifest(hidden), "UNSAFE_INPUT");

  const symbol = manifestCopy() as unknown as Record<string | symbol, unknown>;
  Object.defineProperty(symbol, Symbol("symbolPoison"), { value: "poison", enumerable: true });
  expectManifestCode(() => parseSourceScopeManifest(symbol), "UNSAFE_INPUT");
});

test("review 2: polluted Array.prototype is rejected at the adapter boundary", async () => {
  const bundle = await validBundle();
  const key = "__cleara_review_polluted_array__";
  const before = Object.getOwnPropertyDescriptor(Array.prototype, key);
  Object.defineProperty(Array.prototype, key, { value: "poison", enumerable: true, configurable: true });
  try {
    expectCode(() => new CapitalCommittedAdapter(manifest).adapt(bundle), "UNSAFE_INPUT");
  } finally {
    if (before) Object.defineProperty(Array.prototype, key, before);
    else delete (Array.prototype as unknown as Record<string, unknown>)[key];
  }
});

test("review 2: sparse provider logs return a typed block failure without cursor advance", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-review-sparse-logs-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const sparse: unknown[] = [];
  sparse.length = 1;
  const runner = new SourceBackfill({ manifest, provider: new DeterministicFixtureProvider(fixtureDataset(), { logsOverride: sparse }), c: await boundary(root) });
  const result = await runner.run(request());
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.providerErrors[0]?.code, "MALFORMED_PROVIDER_RESPONSE");
  assert.equal(result.cursor.nextBlock, 10);
});

test("review 2: receipt logs share the receipt transaction identity and unique indexes", async () => {
  const bundle = await validBundle();
  const foreign = makeEvent({ blockNumber: 10, transactionHash: txHash(999), logIndex: 1 });
  const altered = { ...bundle, receipt: { ...bundle.receipt!, logs: [...bundle.receipt!.logs, foreign.log] } };
  expectCode(() => new CapitalCommittedAdapter(manifest).adapt(altered), "INCONSISTENT_SOURCE_DATA");
});

test("review 2: a pending replacement restores with the same B finality semantics", async (t) => {
  const firstRoot = await mkdtemp(join(tmpdir(), "cleara-d1-review-finality-a-"));
  const secondRoot = await mkdtemp(join(tmpdir(), "cleara-d1-review-finality-b-"));
  t.after(async () => Promise.all([rm(firstRoot, { recursive: true, force: true }), rm(secondRoot, { recursive: true, force: true })]));
  const active = { current: new DeterministicFixtureProvider(fixtureDataset()) };
  const provider = switchingProvider(active);
  const runner = new SourceBackfill({ manifest, provider, c: await boundary(firstRoot) });
  await runner.run(request());
  active.current = new DeterministicFixtureProvider({ ...replacementDataset(), latestBlockNumber: 11 });
  const pending = await runner.run(request());
  assert.equal(pending.status, "REPLAY_REQUIRED");
  const restoreBoundary = await boundary(secondRoot);
  assert.doesNotThrow(() => SourceBackfill.fromSerialized({ manifest, provider, c: restoreBoundary }, runner.serializeState()));
});

test("review 2: sparse event ranges advance B headers across no-event gaps", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-review-sparse-gap-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const event = makeEvent({ blockNumber: 12, transactionHash: txHash(12), sourceCommitmentId: hexWord(12) });
  const runner = new SourceBackfill({ manifest, provider: new DeterministicFixtureProvider(fixtureDataset({ events: [event] })), c: await boundary(root) });
  const result = await runner.run(request(10, 12));
  const api = runner.readApi()!;
  assert.equal(result.replayStatus, "CURRENT");
  assert.equal(api.checkpoint(manifest.chainKey)?.lastObservedBlock, 12n);
  const observation = api.timeline(event.log.topics[1] ? `relationship:fixture:capital-commitment:${event.log.topics[1]}` : "")[0] as Record<string, unknown> | undefined;
  assert.equal(observation?.observationState, "OBSERVED");
});

test("review 2: a cursor cannot skip an unprocessed range", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-review-cursor-gap-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const runner = new SourceBackfill({ manifest, provider: new DeterministicFixtureProvider(fixtureDataset()), c: await boundary(root) });
  await runner.run(request(10, 10));
  await assert.rejects(() => runner.run(request(12, 12)), (error: unknown) => error instanceof SourceIngestionError && error.code === "CURSOR_NOT_ADVANCED");
});

test("review 2: header-only reorgs mark old events and require replay", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-review-empty-reorg-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const active = { current: new DeterministicFixtureProvider(fixtureDataset()) };
  const provider = switchingProvider(active);
  const runner = new SourceBackfill({ manifest, provider, c: await boundary(root) });
  await runner.run(request());
  const replacementBlock = hexWord(0xc020);
  active.current = new DeterministicFixtureProvider(fixtureDataset({
    events: [],
    blocks: [
      ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((number) => makeBlock(number)),
      makeBlock(10, { blockHash: replacementBlock }),
      makeBlock(11, { parentHash: replacementBlock }),
      makeBlock(12, { parentHash: blockHash(11) }),
    ],
  }));
  const result = await runner.run(request());
  assert.equal(result.replayStatus, "REPLAY_REQUIRED");
  const old = runner.readApi()!.timeline("relationship:fixture:capital-commitment:" + hexWord(1))[0] as Record<string, unknown> | undefined;
  assert.equal(old?.finalityState, "REORGED");
});

test("review 2: D1 records acceptance only when public B indexed the observation", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-review-b-result-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const original = SliceBSerializedBoundary.prototype.ingest;
  SliceBSerializedBoundary.prototype.ingest = function(snapshot) { return snapshot; };
  try {
    const runner = new SourceBackfill({ manifest, provider: new DeterministicFixtureProvider(fixtureDataset()), c: await boundary(root) });
    const result = await runner.run(request());
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.acceptedEvents.length, 0);
    assert.equal(result.cursor.nextBlock, 10);
  } finally {
    SliceBSerializedBoundary.prototype.ingest = original;
  }
});

test("review 2: requested ranges cannot exceed the provider latest block", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-review-latest-bound-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const runner = new SourceBackfill({ manifest, provider: new DeterministicFixtureProvider(fixtureDataset({ latestBlockNumber: 9 })), c: await boundary(root) });
  const result = await runner.run(request());
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.acceptedEvents.length, 0);
  assert.equal(result.providerErrors[0]?.code, "NOT_FOUND");
  assert.equal(result.cursor.nextBlock, 10);
});

test("review 2: restored accepted records enforce fixed status axes and unique identities", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-review-state-shape-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const runner = new SourceBackfill({ manifest, provider: new DeterministicFixtureProvider(fixtureDataset()), c: await boundary(root) });
  await runner.run(request());
  const forgedStatus = JSON.parse(runner.serializeState()) as { acceptedEvents: Array<Record<string, unknown>> };
  forgedStatus.acceptedEvents[0]!.evidenceStatus = "FORGED";
  const statusBoundary = await boundary(join(root, "status"));
  expectCode(() => SourceBackfill.fromSerialized({ manifest, provider: new DeterministicFixtureProvider(fixtureDataset()), c: statusBoundary }, JSON.stringify(canonical(forgedStatus))), "MALFORMED_PROVIDER_RESPONSE");

  const duplicate = JSON.parse(runner.serializeState()) as { acceptedEvents: Array<Record<string, unknown>> };
  duplicate.acceptedEvents.push({ ...duplicate.acceptedEvents[0] });
  const duplicateBoundary = await boundary(join(root, "duplicate"));
  expectCode(() => SourceBackfill.fromSerialized({ manifest, provider: new DeterministicFixtureProvider(fixtureDataset()), c: duplicateBoundary }, JSON.stringify(canonical(duplicate))), "MALFORMED_PROVIDER_RESPONSE");
});

test("review 2: restored observations cannot be conflicting or cross-scope", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-review-state-binding-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const runner = new SourceBackfill({ manifest, provider: new DeterministicFixtureProvider(fixtureDataset()), c: await boundary(root) });
  await runner.run(request());
  const conflict = mutateSnapshot(runner.serializeState(), (body) => {
    const observation = findObject(body, (candidate) => typeof candidate.observationId === "string" && candidate.observationId.startsWith("observation:"));
    assert.ok(observation);
    observation.observationState = "CONFLICTING";
  });
  const conflictBoundary = await boundary(join(root, "conflict"));
  expectCode(() => SourceBackfill.fromSerialized({ manifest, provider: new DeterministicFixtureProvider(fixtureDataset()), c: conflictBoundary }, conflict), "MALFORMED_PROVIDER_RESPONSE");

  const crossScope = mutateSnapshot(runner.serializeState(), (body) => {
    const sourceScope = findObject(body, (candidate) => candidate.sourceDomain === manifest.sourceDomain && candidate.anchorBlockNumber !== undefined);
    const checkpoint = findObject(body, (candidate) => candidate.sourceDomain === manifest.sourceDomain && candidate.lastObservedBlock !== undefined);
    assert.ok(sourceScope);
    assert.ok(checkpoint);
    sourceScope.sourceDomain = "other-domain";
    checkpoint.sourceDomain = "other-domain";
  });
  const crossScopeBoundary = await boundary(join(root, "cross-scope"));
  expectCode(() => SourceBackfill.fromSerialized({ manifest, provider: new DeterministicFixtureProvider(fixtureDataset()), c: crossScopeBoundary }, crossScope), "MALFORMED_PROVIDER_RESPONSE");
});

test("review 2: a finality-only overlap records a cursor state transition", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-review-sequence-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const active = { current: new DeterministicFixtureProvider(fixtureDataset({ latestBlockNumber: 11, events: [makeEvent({ blockNumber: 10 })] })) };
  const provider = switchingProvider(active);
  const runner = new SourceBackfill({ manifest, provider, c: await boundary(root) });
  const pending = await runner.run(request());
  active.current = new DeterministicFixtureProvider(fixtureDataset({ latestBlockNumber: 12, events: [makeEvent({ blockNumber: 10 })] }));
  const finalized = await runner.run(request());
  assert.equal(finalized.duplicateEvents.length, 1);
  assert.ok(finalized.cursor.sequence > pending.cursor.sequence);
});

test("review 2: a cursor extension starts at the requested range, not before it", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-review-range-extension-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const runner = new SourceBackfill({ manifest, provider: new DeterministicFixtureProvider(fixtureDataset()), c: await boundary(root) });
  await runner.run(request(10, 10));
  await assert.rejects(() => runner.run(request(12, 12)), (error: unknown) => error instanceof SourceIngestionError && error.code === "CURSOR_NOT_ADVANCED");
});
