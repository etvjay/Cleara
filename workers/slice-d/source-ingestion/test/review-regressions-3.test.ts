import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSliceBApi } from "../../../multichain-execution/src/api.js";
import { createSliceBState, ingestObservation } from "../../../multichain-execution/src/slice-b.js";
import { DurableSnapshotStore } from "../../../slice-c/durable-storage/src/index.js";
import { SliceCIntegrationCoordinator } from "../../../slice-c/integration/src/coordinator.js";
import { RetryOrchestrator } from "../../../slice-c/retry-orchestration/src/index.js";
import { parseSourceScopeManifest } from "../../source-scope/src/manifest.js";
import { CapitalCommittedAdapter } from "../src/adapter.js";
import { SourceIngestionError } from "../src/errors.js";
import { DeterministicFixtureProvider } from "../src/fixture-provider.js";
import { SourceBackfill } from "../src/backfill.js";
import { SerializedSliceCBoundary } from "../src/slice-c-boundary.js";
import { SliceBSerializedBoundary } from "../src/slice-b-boundary.js";
import { blockHash, fixtureDataset, hexWord, makeBlock, makeEvent, manifest, manifestCopy, replacementDataset } from "./fixtures.js";

function expectSourceCode(run: () => unknown, code: SourceIngestionError["code"]): void {
  assert.throws(run, (error: unknown) => error instanceof SourceIngestionError && error.code === code);
}

function expectManifestCode(run: () => unknown, code: string): void {
  assert.throws(run, (error: unknown) => error instanceof Error && error.message.startsWith(`${code}:`));
}

async function d1Boundary(root: string): Promise<SerializedSliceCBoundary> {
  return new SerializedSliceCBoundary({
    scopeId: manifest.scopeId,
    manifest,
    store: new DurableSnapshotStore(root),
    retry: new RetryOrchestrator({ defaultPolicy: { maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 20, multiplier: 2 } }),
  });
}

function genericSnapshot() {
  return createSliceBApi(createSliceBState([{
    chainKey: 1,
    chainId: 999,
    sourceDomain: "generic-test-domain",
    adapterVersion: "generic-adapter-v1",
    observationSchemaVersion: "generic-event-v1",
    finalityPolicyVersion: "generic-finality-v1",
    cursorMode: "SPARSE_EVENT",
    anchorBlockNumber: 0n,
    anchorBlockHash: hexWord(0),
  }])).serializeSnapshot();
}

async function genericRetrySnapshot(root: string): Promise<string> {
  const coordinator = new SliceCIntegrationCoordinator({
    scopeId: manifest.scopeId,
    store: new DurableSnapshotStore(root),
    retry: new RetryOrchestrator(),
  });
  const genericApi = createSliceBApi(createSliceBState([{
    chainKey: 1,
    chainId: 999,
    sourceDomain: "generic-test-domain",
    adapterVersion: "generic-adapter-v1",
    observationSchemaVersion: "generic-event-v1",
    finalityPolicyVersion: "generic-finality-v1",
    cursorMode: "SPARSE_EVENT",
    anchorBlockNumber: 0n,
    anchorBlockHash: hexWord(0),
  }]));
  const delivery = coordinator.submitFromApi(genericApi, {
    deliveryId: "delivery:generic-retry",
    selector: { kind: "checkpoint", id: "1" },
    relationshipId: null,
    provider: "generic-provider",
    operation: "provider-read",
  });
  assert.equal(delivery.disposition, "ACCEPTED");
  return coordinator.serializeRetry();
}

test("review 3: D0 rejects a proxy that hides a configurable property", () => {
  const target = manifestCopy() as unknown as Record<string, unknown>;
  Object.defineProperty(target, "hiddenPoison", { value: "poison", configurable: true });
  const hidingProxy = new Proxy(target, {
    ownKeys: (value) => Reflect.ownKeys(value).filter((key) => key !== "hiddenPoison"),
    getOwnPropertyDescriptor: (value, key) => key === "hiddenPoison" ? undefined : Reflect.getOwnPropertyDescriptor(value, key),
  });
  expectManifestCode(() => parseSourceScopeManifest(hidingProxy), "UNSAFE_INPUT");
});

test("review 3: inherited Object.prototype pollution fails closed", () => {
  const key = "__cleara_review_object_pollution__";
  const before = Object.getOwnPropertyDescriptor(Object.prototype, key);
  Object.defineProperty(Object.prototype, key, { value: "poison", enumerable: true, configurable: true });
  try {
    expectManifestCode(() => parseSourceScopeManifest(manifestCopy()), "UNSAFE_INPUT");
  } finally {
    if (before) Object.defineProperty(Object.prototype, key, before);
    else delete (Object.prototype as unknown as Record<string, unknown>)[key];
  }
});

test("review 3: the adapter validates the top-level source bundle boundary", async () => {
  const provider = new DeterministicFixtureProvider(fixtureDataset());
  const block = await provider.getBlockHeader(manifest, 10);
  const parent = await provider.getBlockHeader(manifest, 9);
  const logs = await provider.getLogs(manifest, { address: manifest.contract.address, topic0: manifest.eventFamily.selector, fromBlock: 10, toBlock: 10 });
  const receipt = await provider.getTransactionReceipt(manifest, logs[0]!.transactionHash);
  const target = { identity: await provider.getChainIdentity(manifest), block, parent, log: logs[0], receipt } as Record<string, unknown>;
  Object.defineProperty(target, "hiddenPoison", { value: "poison", configurable: true });
  const hidingProxy = new Proxy(target, {
    ownKeys: (value) => Reflect.ownKeys(value).filter((key) => key !== "hiddenPoison"),
    getOwnPropertyDescriptor: (value, key) => key === "hiddenPoison" ? undefined : Reflect.getOwnPropertyDescriptor(value, key),
  });
  expectSourceCode(() => new CapitalCommittedAdapter(manifest).adapt(hidingProxy as never), "UNSAFE_INPUT");
});

test("review 3: Slice B rejects a hidden observation property", async () => {
  const provider = new DeterministicFixtureProvider(fixtureDataset());
  const block = await provider.getBlockHeader(manifest, 10);
  const parent = await provider.getBlockHeader(manifest, 9);
  const logs = await provider.getLogs(manifest, { address: manifest.contract.address, topic0: manifest.eventFamily.selector, fromBlock: 10, toBlock: 10 });
  const receipt = await provider.getTransactionReceipt(manifest, logs[0]!.transactionHash);
  const observation = { ...new CapitalCommittedAdapter(manifest).adapt({
    identity: await provider.getChainIdentity(manifest),
    block,
    parent,
    log: logs[0],
    receipt,
  }).observation } as unknown as Record<string, unknown>;
  Object.defineProperty(observation, "hiddenPoison", { value: "poison", configurable: true });
  const state = createSliceBState([{
    chainKey: manifest.chainKey,
    chainId: manifest.evmChainId,
    sourceDomain: manifest.sourceDomain,
    adapterVersion: manifest.adapterVersion,
    observationSchemaVersion: manifest.eventFamily.schemaVersion,
    finalityPolicyVersion: manifest.finalityPolicy.version,
    cursorMode: manifest.cursor.mode,
    anchorBlockNumber: 9n,
    anchorBlockHash: blockHash(9),
  }]);
  const next = ingestObservation(state, observation);
  assert.equal(next.observations.size, 0);
  assert.equal(next.deadLetters.some((item) => item.code === "INVALID_OBSERVATION"), true);
});

test("review 3: D1 sparse header advancement remains restorable after an empty block", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-review-sparse-empty-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const event = makeEvent({ blockNumber: 10 });
  const provider = new DeterministicFixtureProvider(fixtureDataset({ events: [event] }));
  const runner = new SourceBackfill({ manifest, provider, c: await d1Boundary(root) });
  const result = await runner.run({ scope: manifest.scopeId, startBlock: 10, endBlock: 11 });
  assert.equal(result.cursor.nextBlock, 12);
  assert.equal(runner.readApi()?.checkpoint(manifest.chainKey)?.lastObservedBlock, 11n);
  assert.doesNotThrow(() => SourceBackfill.fromSerialized({ manifest, provider, c: new SerializedSliceCBoundary({ scopeId: manifest.scopeId, manifest, store: new DurableSnapshotStore(join(root, "restore")), retry: new RetryOrchestrator() }) }, runner.serializeState()));
});

test("review 3: D1 refuses to advance after Slice B rejects a skipped header", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-review-header-rejection-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const provider = new DeterministicFixtureProvider(fixtureDataset({ events: [makeEvent({ blockNumber: 10 })] }));
  const runner = new SourceBackfill({ manifest, provider, c: await d1Boundary(root) });
  await runner.run({ scope: manifest.scopeId, startBlock: 10, endBlock: 11 });
  const originalObserve = SliceBSerializedBoundary.prototype.observeBlockHeader;
  SliceBSerializedBoundary.prototype.observeBlockHeader = function(snapshot) { return snapshot; };
  try {
    const result = await runner.run({ scope: manifest.scopeId, startBlock: 12, endBlock: 12 });
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.cursor.nextBlock, 12);
    assert.equal(result.providerErrors.some((item) => item.code === "MISSING_TRUSTED_HISTORY"), true);
  } finally {
    SliceBSerializedBoundary.prototype.observeBlockHeader = originalObserve;
  }
});

test("review 3: a terminal MAX_SAFE_INTEGER block is rejected before cursor overflow", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-review-max-safe-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runner = new SourceBackfill({ manifest, provider: new DeterministicFixtureProvider(fixtureDataset()), c: await d1Boundary(root) });
  await assert.rejects(() => runner.run({ scope: manifest.scopeId, startBlock: Number.MAX_SAFE_INTEGER, endBlock: Number.MAX_SAFE_INTEGER }), (error: unknown) => error instanceof SourceIngestionError && error.code === "INVALID_BACKFILL_REQUEST");
});

test("review 3: continuation scans the bounded finality look-back for deep reorgs", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-review-lookback-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const active = { current: new DeterministicFixtureProvider(fixtureDataset({ events: [makeEvent({ blockNumber: 10 })] })) };
  const provider = {
    getChainIdentity: (...args: Parameters<DeterministicFixtureProvider["getChainIdentity"]>) => active.current.getChainIdentity(...args),
    getLatestBlockNumber: (...args: Parameters<DeterministicFixtureProvider["getLatestBlockNumber"]>) => active.current.getLatestBlockNumber(...args),
    getBlockHeader: (...args: Parameters<DeterministicFixtureProvider["getBlockHeader"]>) => active.current.getBlockHeader(...args),
    getLogs: (...args: Parameters<DeterministicFixtureProvider["getLogs"]>) => active.current.getLogs(...args),
    getTransactionReceipt: (...args: Parameters<DeterministicFixtureProvider["getTransactionReceipt"]>) => active.current.getTransactionReceipt(...args),
  };
  const runner = new SourceBackfill({ manifest, provider, c: await d1Boundary(root) });
  await runner.run({ scope: manifest.scopeId, startBlock: 10, endBlock: 11 });
  active.current = new DeterministicFixtureProvider(replacementDataset());
  const result = await runner.run({ scope: manifest.scopeId, startBlock: 12, endBlock: 12 });
  assert.equal(result.replayStatus, "REPLAY_REQUIRED");
  const old = runner.readApi()?.timeline("relationship:fixture:capital-commitment:" + hexWord(1))[0] as Record<string, unknown> | undefined;
  assert.equal(old?.finalityState, "REORGED");
});

test("review 3: D1 C recovery and retry restart reject generic Slice B source state", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-review-c-boundary-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const generic = genericSnapshot();
  await new DurableSnapshotStore(root).checkpoint(manifest.scopeId, generic, { savedAt: 1 });
  const boundary = await d1Boundary(root);
  await assert.rejects(() => boundary.recover(), (error: unknown) => error instanceof SourceIngestionError && error.code === "UNSUPPORTED_SCOPE");
  const retryRoot = join(root, "retry");
  const retryBoundary = await d1Boundary(retryRoot);
  const serialized = await genericRetrySnapshot(retryRoot);
  expectSourceCode(() => retryBoundary.restartRetry(serialized), "UNSUPPORTED_SCOPE");
});

test("review 3: serialized retry jobs require a complete source cursor", async () => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-review-retry-shape-"));
  try {
    const serialized = await genericRetrySnapshot(root);
    const parsed = JSON.parse(serialized) as { jobs: Array<{ source: Record<string, unknown> }> };
    delete parsed.jobs[0]!.source.cursor;
    assert.throws(() => RetryOrchestrator.fromSerialized(JSON.stringify(parsed)), /invalid|cursor/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
