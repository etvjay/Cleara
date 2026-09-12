import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSliceBApi, type SliceBApi } from "../../../multichain-execution/src/api.js";
import {
  advanceFinality,
  createSliceBState,
  ingestObservation,
  observationId,
  sourceEventId,
  type ObservationEnvelope,
} from "../../../multichain-execution/src/slice-b.js";
import { DurableSnapshotStore, SnapshotStoreError } from "../../durable-storage/src/index.js";
import {
  RetryOrchestrator,
  type ReadOnlyProvider,
  type RetryRequest,
} from "../../retry-orchestration/src/index.js";
import { SliceCIntegrationCoordinator } from "../src/coordinator.js";

const sourceIdentity: { domain: string; chainKey: number; transactionHash: string; eventIndex: number } = {
  domain: "ethereum-sepolia",
  chainKey: 1,
  transactionHash: "0xabc",
  eventIndex: 0,
};

function observation(
  blockNumber = 10n,
  blockHash = "h10",
  transactionHash = sourceIdentity.transactionHash,
  relationshipId = "relationship:fixture",
  objectId = "commitment:1",
  parentBlockHash = blockNumber === 10n ? "h9" : "h10",
  eventIndex = sourceIdentity.eventIndex,
): ObservationEnvelope {
  const identity = {
    domain: "ethereum-sepolia",
    chainKey: 1,
    transactionHash,
    eventIndex,
  };
  return {
    observationId: observationId(identity, "CapitalCommitted"),
    sourceEventId: sourceEventId(identity),
    relationshipId,
    objectId,
    objectType: "Commitment",
    eventType: "CapitalCommitted",
    sourceDomain: "ethereum-sepolia",
    chainKey: 1,
    chainId: 11155111,
    contractAddress: "0xsource",
    transactionHash,
    eventIndex,
    blockNumber,
    blockHash,
    parentBlockHash,
    observedAt: 1,
    normalizedPayload: { amount: "100000", facilityId: "facility:1" },
    payloadSchemaVersion: "slice-b-observation-v1",
    observationState: "OBSERVED",
    finalityState: "UNKNOWN",
    evidenceId: null,
    creditcoinReference: null,
    projectionReference: null,
    reconciliationReference: null,
    evidenceMode: "fixture_from_live_evidence",
    adapterVersion: "test",
    createdAt: 1,
    updatedAt: 1,
  };
}

function finalizedApi(): SliceBApi {
  let state = ingestObservation(createSliceBState(), observation());
  state = advanceFinality(state, 1, 10n, 2);
  return createSliceBApi(state);
}

function updatedApi(): SliceBApi {
  let state = ingestObservation(createSliceBState(), observation());
  state = advanceFinality(state, 1, 10n, 2);
  state = ingestObservation(state, observation(11n, "h11", "0xdef", "relationship:fixture", "commitment:2", "h10", 1));
  return createSliceBApi(state);
}

function replayRequiredApi(): SliceBApi {
  let state = ingestObservation(createSliceBState(), observation());
  state = advanceFinality(state, 1, 10n, 2);
  state = ingestObservation(state, observation(10n, "replacement-h10", "0xreplacement"));
  return createSliceBApi(state);
}

function checkpointRequest(deliveryId: string): Omit<RetryRequest, "contract"> {
  return {
    deliveryId,
    selector: { kind: "checkpoint", id: "1" },
    relationshipId: null,
    provider: "offline-read",
    operation: "provider-read",
  };
}

async function checkpointFile(root: string): Promise<string> {
  const scopes = await readdir(join(root, "scopes"), { withFileTypes: true });
  assert.equal(scopes.length, 1);
  return join(root, "scopes", scopes[0]!.name, "checkpoint.json");
}

test("combined Slice C path persists, restarts, retries, and reads through Slice B", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-slice-c-integration-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  const coordinator = new SliceCIntegrationCoordinator({
    scopeId: "source:relationship:fixture",
    store: new DurableSnapshotStore(root),
    retry: new RetryOrchestrator({ defaultPolicy: { maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 20, multiplier: 2 } }),
  });
  const initialApi = finalizedApi();
  const initialSnapshot = initialApi.serializeSnapshot();
  const stored = await coordinator.checkpointApi(initialApi, { sequence: 1, savedAt: 1 });
  assert.equal(stored.status, "STORED");
  assert.equal(stored.record.snapshot.hash, initialSnapshot.hash);

  const restarted = await coordinator.restartReadModel();
  assert.ok(restarted);
  assert.equal(restarted.record.snapshot.hash, initialSnapshot.hash);
  assert.equal(restarted.api.serializeSnapshot().hash, initialSnapshot.hash);
  assert.equal(restarted.api.health().readOnly, true);

  const firstDelivery = coordinator.submitFromApi(restarted.api, checkpointRequest("delivery:checkpoint"));
  const duplicateDelivery = coordinator.submitFromApi(restarted.api, checkpointRequest("delivery:checkpoint"));
  assert.equal(firstDelivery.disposition, "ACCEPTED");
  assert.equal(duplicateDelivery.disposition, "DUPLICATE");

  const conflictingDelivery = coordinator.submitFromApi(restarted.api, { ...checkpointRequest("delivery:checkpoint"), provider: "different-provider" });
  assert.equal(conflictingDelivery.disposition, "REJECTED");
  assert.equal(conflictingDelivery.deadLetter?.code, "DELIVERY_ID_CONFLICT");

  const semanticCoordinator = new SliceCIntegrationCoordinator({
    scopeId: "source:relationship:semantic-rejection",
    store: new DurableSnapshotStore(root),
    retry: new RetryOrchestrator(),
  });
  const semanticRejection = semanticCoordinator.submitFromApi(restarted.api, { ...checkpointRequest("delivery:wrong-scope"), relationshipId: "relationship:other" });
  assert.equal(semanticRejection.disposition, "REJECTED");
  assert.equal(semanticCoordinator.executeNext(null, 0).outcome, "IDLE");

  let providerCalls = 0;
  const provider: ReadOnlyProvider = {
    read: (job) => {
      providerCalls += 1;
      return providerCalls === 1
        ? { outcome: "outage", code: "TEMPORARY_PROVIDER_OUTAGE", reason: "offline simulation" }
        : { outcome: "success", receipt: { provider: job.provider, readOnly: true, snapshotHash: job.source.snapshotHash } };
    },
  };
  const retryScheduled = coordinator.executeNext(provider, 0);
  assert.equal(retryScheduled.outcome, "RETRY_SCHEDULED");
  assert.equal(retryScheduled.job?.attempts, 1);
  assert.equal(retryScheduled.job?.nextAttemptAt, 10);

  const retrySnapshot = coordinator.serializeRetry();
  const restartedCoordinator = coordinator.restartRetry(retrySnapshot);
  assert.equal(restartedCoordinator.executeNext(provider, 9).outcome, "IDLE");
  const completed = restartedCoordinator.executeNext(provider, 10);
  assert.equal(completed.outcome, "COMPLETED");
  assert.equal(completed.job?.attempts, 2);

  const updated = await restartedCoordinator.checkpointApi(updatedApi(), { sequence: 2, expectedPreviousHash: initialSnapshot.hash, savedAt: 2 });
  assert.equal(updated.status, "STORED");
  assert.notEqual(updated.record.snapshot.hash, initialSnapshot.hash);
  const updatedRead = await restartedCoordinator.restartReadModel();
  assert.ok(updatedRead);
  assert.equal(updatedRead.api.timeline("relationship:fixture").length, 2);
  assert.equal(updatedRead.api.serializeSnapshot().hash, updated.record.snapshot.hash);

  const otherRoot = await mkdtemp(join(tmpdir(), "cleara-slice-c-other-"));
  t.after(async () => rm(otherRoot, { recursive: true, force: true }));
  const other = new SliceCIntegrationCoordinator({
    scopeId: "source:relationship:other",
    store: new DurableSnapshotStore(otherRoot),
    retry: new RetryOrchestrator(),
  });
  await other.checkpointApi(finalizedApi(), { sequence: 1, savedAt: 1 });
  assert.equal((await other.restartReadModel())?.api.serializeSnapshot().hash, initialSnapshot.hash);
  assert.equal((await restartedCoordinator.restartReadModel())?.record.scopeId, "source:relationship:fixture");
});

test("replay-required survives storage restart and becomes an explicit retry handoff", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-slice-c-replay-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const coordinator = new SliceCIntegrationCoordinator({
    scopeId: "source:relationship:replay",
    store: new DurableSnapshotStore(root),
    retry: new RetryOrchestrator(),
  });
  const api = replayRequiredApi();
  const stored = await coordinator.checkpointApi(api, { sequence: 1, savedAt: 1 });
  assert.equal(stored.status, "STORED");
  assert.equal(api.checkpoint(1)?.replayStatus, "REPLAY_REQUIRED");

  const recovered = await coordinator.restartReadModel();
  assert.ok(recovered);
  assert.equal(recovered.api.checkpoint(1)?.replayStatus, "REPLAY_REQUIRED");
  const handoffRequest = { ...checkpointRequest("delivery:replay"), operation: "replay-required-handoff" as const, provider: "projection-read" };
  assert.equal(coordinator.submitFromApi(recovered.api, handoffRequest).disposition, "ACCEPTED");
  const handoff = coordinator.executeNext(null, 0);
  assert.equal(handoff.outcome, "HANDOFF_EMITTED");
  assert.equal(handoff.handoff?.status, "REPLAY_REQUIRED");
  assert.equal((await coordinator.restartReadModel())?.api.checkpoint(1)?.replayStatus, "REPLAY_REQUIRED");
  assert.equal((await coordinator.restartReadModel())?.api.checkpoint(1)?.replayStatus, "REPLAY_REQUIRED");
});

test("retry restart preserves terminal dead letters and only explicit operator replay requeues", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-slice-c-dead-letter-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const coordinator = new SliceCIntegrationCoordinator({
    scopeId: "source:relationship:dead-letter",
    store: new DurableSnapshotStore(root),
    retry: new RetryOrchestrator({ defaultPolicy: { maxAttempts: 2, initialDelayMs: 10, maxDelayMs: 10, multiplier: 2 } }),
  });
  const api = finalizedApi();
  await coordinator.checkpointApi(api, { sequence: 1, savedAt: 1 });
  const submitted = coordinator.submitFromApi(api, checkpointRequest("delivery:dead-letter"));
  assert.equal(submitted.disposition, "ACCEPTED");
  const outage: ReadOnlyProvider = { read: () => ({ outcome: "outage", code: "TEMPORARY", reason: "offline outage" }) };
  assert.equal(coordinator.executeNext(outage, 0).outcome, "RETRY_SCHEDULED");
  const terminal = coordinator.executeNext(outage, 10);
  assert.equal(terminal.outcome, "DEAD_LETTERED");
  assert.ok(terminal.job?.id);
  const restarted = coordinator.restartRetry(coordinator.serializeRetry());
  const persisted = JSON.parse(restarted.serializeRetry()) as { jobs: Array<{ status: string }> };
  assert.equal(persisted.jobs[0]?.status, "DEAD_LETTERED");
  assert.throws(() => coordinator.restartRetry("{not-json"), /retry snapshot is not valid JSON/);

  const requeued = restarted.operatorReplay(terminal.job!.id);
  assert.equal(requeued.status, "PENDING");
  const completed = restarted.executeNext({ read: () => ({ outcome: "success", receipt: { operatorReplay: true } }) }, 0);
  assert.equal(completed.outcome, "COMPLETED");
});

test("corrupt persisted bytes fail closed through the integration restart boundary", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-slice-c-corrupt-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const coordinator = new SliceCIntegrationCoordinator({
    scopeId: "source:relationship:corrupt",
    store: new DurableSnapshotStore(root),
    retry: new RetryOrchestrator(),
  });
  await coordinator.checkpointApi(finalizedApi(), { sequence: 1, savedAt: 1 });
  const path = await checkpointFile(root);
  await writeFile(path, "{corrupt", "utf8");
  await assert.rejects(
    () => coordinator.restartReadModel(),
    (error: unknown) => error instanceof SnapshotStoreError && error.code === "CORRUPT_RECORD",
  );
  assert.equal(await readFile(path, "utf8"), "{corrupt");
});
