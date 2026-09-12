import test from "node:test";
import assert from "node:assert/strict";
import { createSliceBApi } from "../src/api.js";
import {
  advanceFinality,
  buildRelationshipGraph,
  createSliceBState,
  ingestObservation,
  observationId,
  projectRelationship,
  recordCanonical,
  recordEvidence,
  reconcile,
  replayReorg,
  restoreSnapshot,
  snapshot,
  snapshotHash,
  sourceEventId,
  type ObservationEnvelope,
} from "../src/slice-b.js";

const identity = { domain: "ethereum-sepolia", chainKey: 1, transactionHash: "0xabc", eventIndex: 0 } as const;
const baseObservation = (blockNumber = 10n, blockHash = "h10", transactionHash: string = identity.transactionHash, relationshipId = "relationship:fixture", objectId = "commitment:1"): ObservationEnvelope => {
  const source = { ...identity, transactionHash };
  return {
  observationId: observationId(source, "CapitalCommitted"),
  sourceEventId: sourceEventId(source),
  relationshipId,
  objectId,
  objectType: "Commitment",
  eventType: "CapitalCommitted",
  sourceDomain: "ethereum-sepolia",
  chainKey: 1,
  chainId: 11155111,
  contractAddress: "0xsource",
  transactionHash,
  eventIndex: identity.eventIndex,
  blockNumber,
  blockHash,
  parentBlockHash: blockNumber === 10n ? "h9" : "h10",
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
};

test("stable source identity and duplicate ingestion are deterministic", () => {
  assert.equal(sourceEventId(identity), sourceEventId(identity));
  let state = ingestObservation(createSliceBState(), baseObservation());
  state = ingestObservation(state, baseObservation());
  assert.equal(state.observations.get(baseObservation().observationId)?.observationState, "DUPLICATE");
  assert.equal(state.deadLetters.length, 0);
});

test("finality promotion never accepts an unfinalized observation", () => {
  let state = ingestObservation(createSliceBState(), baseObservation());
  state = advanceFinality(state, 1, 9n);
  assert.equal(state.observations.get(baseObservation().observationId)?.finalityState, "FINALITY_PENDING");
  state = advanceFinality(state, 1, 10n);
  assert.equal(state.observations.get(baseObservation().observationId)?.finalityState, "FINALIZED");
});

test("evidence and canonical state remain separate axes", () => {
  let state = ingestObservation(createSliceBState(), baseObservation());
  state = recordEvidence(state, { evidenceId: "evidence:1", relationshipId: "relationship:fixture", sourceEventId: sourceEventId(identity), mode: "fixture_from_live_evidence", sourceDomain: "ethereum-sepolia", chainKey: 1, transactionHash: "0xabc", blockNumber: 10n, attestcoinReference: "attest:1", status: "PENDING", linkedCreditcoinTransition: null, sourceReference: "M6", reason: null });
  state = recordCanonical(state, { relationshipId: "relationship:fixture", creditcoinChainId: 102031, contractAddress: "0xcc3", transactionHash: null, blockNumber: null, blockHash: null, objectId: "commitment:1", state: "ACTIVE", readStatus: "READ", expectedState: "ACTIVE", readAt: 2 });
  const item = state.observations.get(baseObservation().observationId)!;
  assert.equal(item.evidenceId, "evidence:1");
  assert.equal(state.canonical.get("commitment:1")?.state, "ACTIVE");
  assert.equal(state.evidence.get("evidence:1")?.status, "PENDING");
});

test("mismatch is explicit and carries recovery ownership", () => {
  const state = reconcile(createSliceBState(), { relationshipId: "relationship:fixture", sourceEventId: "source:1", canonicalObjectId: "commitment:1", state: "MISMATCH", observationAmount: "100000", canonicalAmount: "90000", authority: "creditcoin", nextAction: "Pause downstream action and reconcile amounts", recoveryRole: "operator", reason: "source and canonical amount differ" });
  const record = [...state.reconciliations.values()][0]!;
  assert.equal(record.state, "MISMATCH");
  assert.equal(record.recoveryRole, "operator");
});

test("reorg preserves history and finality cannot clear replay-required", () => {
  let state = ingestObservation(createSliceBState(), baseObservation());
  state = advanceFinality(state, 1, 10n, 2);
  const replacement = baseObservation(10n, "replacement-h10", "0xreplacement");
  state = ingestObservation(state, replacement);
  assert.equal(state.checkpoints.get(1)?.replayStatus, "REPLAY_REQUIRED");
  state = advanceFinality(state, 1, 10n, 3);
  assert.equal(state.checkpoints.get(1)?.replayStatus, "REPLAY_REQUIRED");
  assert.equal(state.observations.get(baseObservation().observationId)?.finalityState, "REORGED");
});

test("explicit replay promotes the replacement once and is idempotent", () => {
  let state = ingestObservation(createSliceBState(), baseObservation());
  state = advanceFinality(state, 1, 10n, 2);
  const replacement = baseObservation(10n, "replacement-h10", "0xreplacement");
  state = ingestObservation(state, replacement);
  const replayed = replayReorg(state, replacement, { finalizedBlock: 10n, observedAt: 4 });
  assert.equal(replayed.outcome, "REPLAYED");
  assert.equal(replayed.state.checkpoints.get(1)?.replayStatus, "CURRENT");
  assert.equal(replayed.state.observations.get(baseObservation().observationId)?.finalityState, "REORGED");
  assert.equal(replayed.state.observations.get(replacement.observationId)?.finalityState, "FINALIZED");
  const second = replayReorg(replayed.state, replacement, { finalizedBlock: 10n, observedAt: 5 });
  assert.equal(second.outcome, "NOOP");
  assert.equal(second.state.replayHistory.filter((attempt) => attempt.status === "SUCCEEDED").length, 1);
});

test("malformed replacement remains blocked", () => {
  let state = ingestObservation(createSliceBState(), baseObservation());
  state = advanceFinality(state, 1, 10n, 2);
  const replacement = baseObservation(10n, "replacement-h10", "0xreplacement");
  state = ingestObservation(state, replacement);
  const blocked = replayReorg(state, { ...replacement, observationState: "CONFLICTING" }, { finalizedBlock: 10n, observedAt: 4 });
  assert.equal(blocked.outcome, "BLOCKED");
  assert.equal(blocked.state.checkpoints.get(1)?.replayStatus, "REPLAY_REQUIRED");
});

test("read-only API exposes projection boundary and checkpoints", () => {
  let state = ingestObservation(createSliceBState(), baseObservation());
  state = projectRelationship(state, "relationship:fixture");
  const api = createSliceBApi(state);
  assert.equal(api.health().readOnly, true);
  const relationship = api.relationship("relationship:fixture") as { canonical: boolean; evidenceMode: string };
  assert.equal(relationship.canonical, false);
  assert.equal(relationship.evidenceMode, "local_projection");
  assert.equal(api.timeline("relationship:fixture").length, 1);
});

test("evidence lookup is explicit and relationship scope is isolated", () => {
  let state = createSliceBState();
  state = recordEvidence(state, { evidenceId: "evidence:r1", relationshipId: "r1", sourceEventId: "source:r1", mode: "implemented_local", sourceDomain: "ethereum-sepolia", chainKey: 1, transactionHash: "0xr1", blockNumber: 1n, attestcoinReference: "attest:r1", status: "ACCEPTED", linkedCreditcoinTransition: "cc3:r1", sourceReference: "fixture:r1", reason: null });
  state = recordEvidence(state, { evidenceId: "evidence:r2", relationshipId: "r2", sourceEventId: "source:r2", mode: "implemented_local", sourceDomain: "ethereum-sepolia", chainKey: 1, transactionHash: "0xr2", blockNumber: 2n, attestcoinReference: "attest:r2", status: "PENDING", linkedCreditcoinTransition: null, sourceReference: "fixture:r2", reason: null });
  state = recordCanonical(state, { relationshipId: "r1", creditcoinChainId: 102031, contractAddress: "0xcc3-r1", transactionHash: null, blockNumber: null, blockHash: null, objectId: "object:r1", state: "ACTIVE", readStatus: "READ", expectedState: "ACTIVE", readAt: 3 });
  state = recordCanonical(state, { relationshipId: "r2", creditcoinChainId: 102031, contractAddress: "0xcc3-r2", transactionHash: null, blockNumber: null, blockHash: null, objectId: "object:r2", state: "ACTIVE", readStatus: "READ", expectedState: "ACTIVE", readAt: 3 });
  const api = createSliceBApi(state);
  const r1 = api.relationship("r1") as { evidence: Array<{ evidenceId: string }>; canonicalState: Array<{ objectId: string }> };
  assert.deepEqual(r1.evidence.map((item) => item.evidenceId), ["evidence:r1"]);
  assert.deepEqual(r1.canonicalState.map((item) => item.objectId), ["object:r1"]);
  assert.equal(api.evidence("evidence:r1")?.evidenceId, "evidence:r1");
  assert.equal(api.evidence("evidence:missing"), null);
});
test("snapshot restore preserves deterministic state across restart", () => {
  let state = ingestObservation(createSliceBState(), baseObservation());
  state = advanceFinality(state, 1, 10n, 2);
  state = projectRelationship(state, "relationship:fixture");
  const restored = restoreSnapshot(snapshot(state));
  assert.equal(snapshotHash(restored), snapshotHash(state));
});

test("graph and snapshot hash are deterministic", () => {
  let state = ingestObservation(createSliceBState(), baseObservation());
  state = reconcile(state, { relationshipId: "relationship:fixture", sourceEventId: sourceEventId(identity), canonicalObjectId: "commitment:1", state: "PENDING", observationAmount: "100000", canonicalAmount: null, authority: "projection", nextAction: "Wait for canonical read", recoveryRole: "operator", reason: "canonical state not read" });
  state = projectRelationship(state, "relationship:fixture");
  const graph = buildRelationshipGraph(state, "relationship:fixture");
  assert.equal(graph.schemaVersion, "slice-b-graph-v1");
  assert.equal(graph.nodes.some((node) => node.id === "commitment:1"), true);
  assert.equal(snapshotHash(state), snapshotHash(state));
});
