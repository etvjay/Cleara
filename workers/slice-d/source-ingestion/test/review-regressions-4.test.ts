import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSliceBApi } from "../../../multichain-execution/src/api.js";
import { createSliceBState, ingestObservation } from "../../../multichain-execution/src/slice-b.js";
import { DurableSnapshotStore } from "../../../slice-c/durable-storage/src/index.js";
import { RetryOrchestrator } from "../../../slice-c/retry-orchestration/src/index.js";
import { identityHash } from "../../../slice-c/retry-orchestration/src/canonical.js";
import { parseSourceScopeManifest, serializeSourceScopeManifest } from "../../source-scope/src/manifest.js";
import { CapitalCommittedAdapter } from "../src/adapter.js";
import { SourceIngestionError } from "../src/errors.js";
import { DeterministicFixtureProvider } from "../src/fixture-provider.js";
import { SourceBackfill } from "../src/backfill.js";
import { SerializedSliceCBoundary } from "../src/slice-c-boundary.js";
import { SliceBSerializedBoundary } from "../src/slice-b-boundary.js";
import { blockHash, fixtureDataset, hexWord, makeBlock, makeEvent, manifest, manifestCopy } from "./fixtures.js";

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

function genericScope() {
  return {
    chainKey: 1,
    chainId: 999,
    sourceDomain: "generic-test-domain",
    adapterVersion: "generic-adapter-v1",
    observationSchemaVersion: "generic-event-v1",
    finalityPolicyVersion: "generic-finality-v1",
    cursorMode: "SPARSE_EVENT" as const,
    anchorBlockNumber: 0n,
    anchorBlockHash: hexWord(0),
  };
}

async function genericRetrySnapshot(root: string): Promise<string> {
  const coordinator = new (await import("../../../slice-c/integration/src/coordinator.js")).SliceCIntegrationCoordinator({
    scopeId: manifest.scopeId,
    store: new DurableSnapshotStore(root),
    retry: new RetryOrchestrator(),
  });
  const genericApi = createSliceBApi(createSliceBState([genericScope()]));
  const delivery = coordinator.submitFromApi(genericApi, {
    deliveryId: "delivery:generic-retry-4",
    selector: { kind: "checkpoint", id: "1" },
    relationshipId: null,
    provider: "generic-provider",
    operation: "provider-read",
  });
  assert.equal(delivery.disposition, "ACCEPTED");
  return coordinator.serializeRetry();
}

function refreshSourceBinding(source: Record<string, unknown>): void {
  const { snapshotBindingHash: _ignored, ...sourceWithoutBinding } = source;
  source.snapshotBindingHash = identityHash({ version: "slice-c-source-binding-v1", source: sourceWithoutBinding });
}

function bSnapshotHash(body: string): string {
  return createHash("sha256").update(`${body.length}:${body}`, "utf8").digest("hex");
}

test("review 4: safe boundary inspection rejects self-replacing getters without invoking them", async (t) => {
  let manifestHits = 0;
  const manifestValue = manifestCopy() as unknown as Record<string, unknown>;
  const manifestScope = manifestValue.scopeId;
  Object.defineProperty(manifestValue, "scopeId", {
    configurable: true,
    enumerable: true,
    get() {
      manifestHits += 1;
      Object.defineProperty(manifestValue, "scopeId", { configurable: true, enumerable: true, writable: true, value: manifestScope });
      return manifestScope;
    },
  });
  expectManifestCode(() => parseSourceScopeManifest(manifestValue), "UNSAFE_INPUT");
  assert.equal(manifestHits, 0);

  const provider = new DeterministicFixtureProvider(fixtureDataset());
  const block = await provider.getBlockHeader(manifest, 10);
  const parent = await provider.getBlockHeader(manifest, 9);
  const logs = await provider.getLogs(manifest, { address: manifest.contract.address, topic0: manifest.eventFamily.selector, fromBlock: 10, toBlock: 10 });
  const receipt = await provider.getTransactionReceipt(manifest, logs[0]!.transactionHash);
  let adapterHits = 0;
  const bundle = { identity: await provider.getChainIdentity(manifest), block, parent, log: logs[0], receipt } as Record<string, unknown>;
  const originalLog = bundle.log;
  Object.defineProperty(bundle, "log", {
    configurable: true,
    enumerable: true,
    get() {
      adapterHits += 1;
      Object.defineProperty(bundle, "log", { configurable: true, enumerable: true, writable: true, value: originalLog });
      return originalLog;
    },
  });
  expectSourceCode(() => new CapitalCommittedAdapter(manifest).adapt(bundle as never), "UNSAFE_INPUT");
  assert.equal(adapterHits, 0);

  let observationHits = 0;
  const observation = { ...new CapitalCommittedAdapter(manifest).adapt({ identity: await provider.getChainIdentity(manifest), block, parent, log: logs[0], receipt }).observation } as unknown as Record<string, unknown>;
  const payload = observation.normalizedPayload;
  Object.defineProperty(observation, "normalizedPayload", {
    configurable: true,
    enumerable: true,
    get() {
      observationHits += 1;
      Object.defineProperty(observation, "normalizedPayload", { configurable: true, enumerable: true, writable: true, value: payload });
      return payload;
    },
  });
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
  assert.equal(observationHits, 0);
});

test("review 4: backfill request safety rejects self-replacing getters without invoking them", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-review-self-replacing-request-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runner = new SourceBackfill({ manifest, provider: new DeterministicFixtureProvider(fixtureDataset()), c: await d1Boundary(root) });
  let hits = 0;
  const request = { scope: manifest.scopeId, startBlock: 10, endBlock: 11 } as Record<string, unknown>;
  Object.defineProperty(request, "endBlock", {
    configurable: true,
    enumerable: true,
    get() {
      hits += 1;
      Object.defineProperty(request, "endBlock", { configurable: true, enumerable: true, writable: true, value: 11 });
      return 11;
    },
  });
  await assert.rejects(() => runner.run(request as never), (error: unknown) => error instanceof SourceIngestionError && error.code === "INVALID_BACKFILL_REQUEST");
  assert.equal(hits, 0);
});

test("review 4: parsed manifests deep-freeze mappings and event fields", () => {
  const parsed = parseSourceScopeManifest(manifestCopy());
  assert.equal(Object.isFrozen(parsed.relationshipMappings[0]), true);
  assert.equal(Object.isFrozen(parsed.eventFamily.indexedFields[0]), true);
  assert.equal(Object.isFrozen(parsed.eventFamily.dataFields[0]), true);
});

test("review 4: retry restart rejects canonical metadata edited onto a generic snapshot", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-review-retry-binding-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const serialized = await genericRetrySnapshot(root);
  const parsed = JSON.parse(serialized) as { jobs: Array<{ source: Record<string, unknown> }> };
  const source = parsed.jobs[0]!.source;
  source.sourceDomain = manifest.sourceDomain;
  source.chainId = manifest.evmChainId;
  source.adapterVersion = manifest.adapterVersion;
  source.observationSchemaVersion = manifest.eventFamily.schemaVersion;
  source.finalityPolicyVersion = manifest.finalityPolicy.version;
  source.cursorMode = manifest.cursor.mode;
  source.sourceScopeHash = serializeSourceScopeManifest(manifest).hash;
  source.cursor = { ...(source.cursor as Record<string, unknown>), chainKey: manifest.chainKey };
  refreshSourceBinding(source);
  const boundary = await d1Boundary(join(root, "boundary"));
  expectSourceCode(() => boundary.restartRetry(JSON.stringify(parsed)), "UNSUPPORTED_SCOPE");
});

test("review 4: retry snapshots accept the bigint representation emitted by their own runtime", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-review-retry-roundtrip-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const serialized = await genericRetrySnapshot(root);
  const parsed = JSON.parse(serialized) as { jobs: Array<{ source: Record<string, unknown> }> };
  parsed.jobs[0]!.source.cursor = { ...(parsed.jobs[0]!.source.cursor as Record<string, unknown>), blockNumber: "10n" };
  refreshSourceBinding(parsed.jobs[0]!.source);
  assert.doesNotThrow(() => RetryOrchestrator.fromSerialized(JSON.stringify(parsed)));
});

test("review 4: public Slice B API returns immutable defensive copies", () => {
  const api = createSliceBApi(createSliceBState([genericScope()]));
  const checkpoint = api.checkpoint(1);
  assert.ok(checkpoint);
  (checkpoint as { lastFinalizedBlock: bigint }).lastFinalizedBlock = 999n;
  assert.equal(api.checkpoint(1)?.lastFinalizedBlock, 0n);
});

test("review 4: restored checkpoints reject finality beyond the observed header", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-review-checkpoint-bounds-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const boundary = new SliceBSerializedBoundary(manifest);
  const snapshot = boundary.initialize(makeBlock(9));
  const body = snapshot.body.replace('"lastFinalizedBlock":"9n"', '"lastFinalizedBlock":"999n"');
  assert.notEqual(body, snapshot.body);
  expectSourceCode(() => boundary.read({ body, hash: bSnapshotHash(body) }), "MALFORMED_PROVIDER_RESPONSE");
});

test("review 4: D1 finality state follows the public Slice B observation state", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-d1-review-finality-consistency-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const event = makeEvent({ blockNumber: 0 });
  const provider = new DeterministicFixtureProvider(fixtureDataset({ latestBlockNumber: 0, blocks: [makeBlock(0)], events: [event] }));
  const runner = new SourceBackfill({ manifest, provider, c: await d1Boundary(root) });
  const result = await runner.run({ scope: manifest.scopeId, startBlock: 0, endBlock: 0 });
  const accepted = result.acceptedEvents[0];
  const relationshipId = `relationship:fixture:capital-commitment:${hexWord(1)}`;
  const publicObservation = runner.readApi()?.timeline(relationshipId).find((item) => (item as { observationId?: unknown }).observationId === accepted?.observationId) as { finalityState?: string } | undefined;
  assert.ok(accepted);
  assert.ok(publicObservation);
  assert.equal(accepted.finalityState, publicObservation.finalityState);
  assert.equal(publicObservation.finalityState, "UNKNOWN");
});

test("review 4: adapter rejects parent headers newer than their child", async () => {
  const provider = new DeterministicFixtureProvider(fixtureDataset());
  const block = await provider.getBlockHeader(manifest, 10);
  const parent = makeBlock(9, { timestamp: block.timestamp + 1 });
  const logs = await provider.getLogs(manifest, { address: manifest.contract.address, topic0: manifest.eventFamily.selector, fromBlock: 10, toBlock: 10 });
  const receipt = await provider.getTransactionReceipt(manifest, logs[0]!.transactionHash);
  const identity = await provider.getChainIdentity(manifest);
  expectSourceCode(() => new CapitalCommittedAdapter(manifest).adapt({ identity, block, parent, log: logs[0], receipt }), "INCONSISTENT_SOURCE_DATA");
});

test("review 4: adapter constructor rejects a same-scope forged manifest", async () => {
  const provider = new DeterministicFixtureProvider(fixtureDataset());
  const forged = manifestCopy() as unknown as { contract: { address: string } };
  forged.contract.address = "0x000000000000000000000000000000000000d099";
  const block = await provider.getBlockHeader(manifest, 10);
  const parent = await provider.getBlockHeader(manifest, 9);
  const logs = await provider.getLogs(manifest, { address: manifest.contract.address, topic0: manifest.eventFamily.selector, fromBlock: 10, toBlock: 10 });
  const receipt = await provider.getTransactionReceipt(manifest, logs[0]!.transactionHash);
  const log = { ...logs[0]!, address: forged.contract.address };
  const forgedReceipt = { ...receipt, logs: [log] };
  const identity = await provider.getChainIdentity(manifest);
  expectSourceCode(() => new CapitalCommittedAdapter(forged as never).adapt({ identity, block, parent, log, receipt: forgedReceipt }), "UNSUPPORTED_SCOPE");
});
