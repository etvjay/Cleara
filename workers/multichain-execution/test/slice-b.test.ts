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
  type EvidenceRecord,
  type ObservationEnvelope,
} from "../src/slice-b.js";

const identity = { domain: "ethereum-sepolia", chainKey: 1, transactionHash: "0xabc", eventIndex: 0 } as const;
const baseObservation = (
  blockNumber = 10n,
  blockHash = "h10",
  transactionHash: string = identity.transactionHash,
  relationshipId = "relationship:fixture",
  objectId = "commitment:1",
  parentBlockHash = blockNumber === 10n ? "h9" : "h10",
  chainKey: number = 1,
  chainId: number = 11155111,
  sourceDomain = "ethereum-sepolia",
  adapterVersion = "test",
  payloadSchemaVersion = "slice-b-observation-v1",
  eventIndex: number = identity.eventIndex,
): ObservationEnvelope => {
  const source = { ...identity, transactionHash, chainKey, domain: sourceDomain, eventIndex };
  return {
    observationId: observationId(source, "CapitalCommitted"),
    sourceEventId: sourceEventId(source),
    relationshipId,
    objectId,
    objectType: "Commitment",
    eventType: "CapitalCommitted",
    sourceDomain,
    chainKey,
    chainId,
    contractAddress: "0xsource",
    transactionHash,
    eventIndex,
    blockNumber,
    blockHash,
    parentBlockHash,
    observedAt: 1,
    normalizedPayload: { amount: "100000", facilityId: "facility:1" },
    payloadSchemaVersion,
    observationState: "OBSERVED",
    finalityState: "UNKNOWN",
    evidenceId: null,
    creditcoinReference: null,
    projectionReference: null,
    reconciliationReference: null,
    evidenceMode: "fixture_from_live_evidence",
    adapterVersion,
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
  assert.equal([...state.canonical.values()].find((item) => item.relationshipId === "relationship:fixture" && item.objectId === "commitment:1")?.state, "ACTIVE");
  assert.equal(state.evidence.get("evidence:1")?.status, "PENDING");
});

test("mismatch is explicit and carries recovery ownership", () => {
  const state = reconcile(createSliceBState(), { relationshipId: "relationship:fixture", sourceEventId: "source:1", canonicalObjectId: "commitment:1", state: "MISMATCH", observationAmount: "100000", canonicalAmount: "90000", authority: "creditcoin", nextAction: "Pause downstream action and reconcile amounts", recoveryRole: "operator", reason: "source and canonical amount differ" });
  const record = [...state.reconciliations.values()][0]!;
  assert.equal(record.state, "MISMATCH");
  assert.equal(record.recoveryRole, "operator");
});

test("reconciliation current state is distinct from reconciliation history", () => {
  const initial = { relationshipId: "relationship:history", sourceEventId: "source:history", canonicalObjectId: "commitment:history", state: "PENDING" as const, observationAmount: "100", canonicalAmount: null, authority: "projection" as const, nextAction: "Wait", recoveryRole: "operator", reason: "awaiting proof" };
  const updated = { ...initial, state: "MISMATCH" as const, canonicalAmount: "90", nextAction: "Pause", reason: "amount differs" };
  let state = reconcile(createSliceBState(), initial);
  state = reconcile(state, updated);
  assert.equal(state.reconciliations.size, 1);
  assert.equal([...state.reconciliations.values()][0]?.state, "MISMATCH");
  assert.equal(state.reconciliationHistory.length, 2);
  assert.deepEqual(state.reconciliationHistory.map((record) => record.state), ["PENDING", "MISMATCH"]);
  const api = createSliceBApi(state);
  const relationship = api.relationship("relationship:history") as { reconciliations: Array<{ state: string }>; reconciliationHistory: Array<{ state: string }> };
  assert.deepEqual(relationship.reconciliations.map((record) => record.state), ["MISMATCH"]);
  assert.deepEqual(relationship.reconciliationHistory.map((record) => record.state), ["PENDING", "MISMATCH"]);
  assert.equal(api.investigations("relationship:history").filter((item) => (item as { state?: string }).state === "MISMATCH").length, 1);
  state = reconcile(state, initial);
  assert.equal(state.reconciliationHistory.length, 3);
  assert.deepEqual(state.reconciliationHistory.map((record) => record.state), ["PENDING", "MISMATCH", "PENDING"]);
});

test("reconciliation terminal transitions replace current state and close investigations", () => {
  const pending = { relationshipId: "relationship:terminal", sourceEventId: "source:terminal", canonicalObjectId: "object:terminal", state: "PENDING" as const, observationAmount: "100", canonicalAmount: null, authority: "projection" as const, nextAction: "Wait", recoveryRole: "operator", reason: "awaiting canonical state" };
  const mismatch = { ...pending, state: "MISMATCH" as const, canonicalAmount: "90", nextAction: "Pause", reason: "amount differs" };
  const reconciled = { ...pending, state: "RECONCILED" as const, canonicalAmount: "100", nextAction: "No action", reason: "amount agrees" };
  let state = reconcile(createSliceBState(), pending);
  state = reconcile(state, mismatch);
  state = reconcile(state, reconciled);
  assert.equal(state.reconciliations.size, 1);
  assert.equal([...state.reconciliations.values()][0]?.state, "RECONCILED");
  assert.deepEqual(state.reconciliationHistory.map((record) => record.state), ["PENDING", "MISMATCH", "RECONCILED"]);
  assert.equal(createSliceBApi(state).investigations("relationship:terminal").some((item) => (item as { canonicalObjectId?: string }).canonicalObjectId === "object:terminal"), false);
  const restored = restoreSnapshot(snapshot(state));
  assert.equal(snapshotHash(restored), snapshotHash(state));
});

test("a second event in an already canonical block does not demote its trusted header", () => {
  let state = ingestObservation(createSliceBState(), baseObservation(10n, "h10", "0xfirst-event", "relationship:block-events", "commitment:first", "h9", 1, 11155111, "ethereum-sepolia", "test", "slice-b-observation-v1", 0));
  state = advanceFinality(state, 1, 10n, 2);
  state = ingestObservation(state, baseObservation(10n, "h10", "0xsecond-event", "relationship:block-events", "commitment:second", "h9", 1, 11155111, "ethereum-sepolia", "test", "slice-b-observation-v1", 1));
  const header = [...state.blockHistory.values()].find((item) => item.blockHash === "h10");
  assert.equal(header?.status, "CANONICAL");
  assert.equal(header?.observationId, observationId({ domain: "ethereum-sepolia", chainKey: 1, transactionHash: "0xfirst-event", eventIndex: 0 }, "CapitalCommitted"));
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
  state = advanceFinality(state, 1, 10n, 3);
  const finalizedReplacement = state.observations.get(replacement.observationId)!;
  const replayed = replayReorg(state, finalizedReplacement, { finalizedBlock: 10n, observedAt: 4 });
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

test("replay rejects a candidate whose parent does not match the trusted predecessor", () => {
  let state = ingestObservation(createSliceBState(), baseObservation());
  state = advanceFinality(state, 1, 10n, 2);
  const invalid = baseObservation(10n, "replacement-invalid-parent", "0xreplacement-invalid", "relationship:fixture", "commitment:1", "not-h9");
  state = ingestObservation(state, invalid);
  state = advanceFinality(state, 1, 10n, 3);
  const blocked = replayReorg(state, state.observations.get(invalid.observationId)!, { finalizedBlock: 10n, observedAt: 4 });
  assert.equal(blocked.outcome, "BLOCKED");
  assert.equal(blocked.state.checkpoints.get(1)?.replayStatus, "REPLAY_REQUIRED");
});

test("replay accepts the known predecessor and rejects identity metadata drift", () => {
  const identityCases: Array<[string, Partial<ObservationEnvelope>]> = [
    ["wrong chain key", { chainKey: 2 }],
    ["wrong chain identity", { chainId: 999999 }],
    ["wrong source domain", { sourceDomain: "ethereum-mainnet" }],
    ["wrong adapter version", { adapterVersion: "adapter-v2" }],
    ["wrong schema version", { payloadSchemaVersion: "slice-b-observation-v2" }],
    ["wrong block number", { blockNumber: 11n }],
  ];
  for (const [label, mutation] of identityCases) {
    let state = ingestObservation(createSliceBState(), baseObservation());
    state = advanceFinality(state, 1, 10n, 2);
    const replacement = baseObservation(10n, `replacement-${label}`, `0x${label.replaceAll(" ", "")}`);
    state = ingestObservation(state, replacement);
    state = advanceFinality(state, 1, 10n, 3);
    const command = { ...state.observations.get(replacement.observationId)!, ...mutation };
    const blocked = replayReorg(state, command, { finalizedBlock: 10n, observedAt: 4 });
    assert.equal(blocked.outcome, "BLOCKED", label);
    assert.equal(blocked.state.checkpoints.get(1)?.replayStatus, "REPLAY_REQUIRED", label);
  }

  let validState = ingestObservation(createSliceBState(), baseObservation());
  validState = advanceFinality(validState, 1, 10n, 2);
  const valid = baseObservation(10n, "replacement-valid", "0xreplacement-valid", "relationship:fixture", "commitment:1", "h9");
  validState = ingestObservation(validState, valid);
  validState = advanceFinality(validState, 1, 10n, 3);
  const replayed = replayReorg(validState, validState.observations.get(valid.observationId)!, { finalizedBlock: 10n, observedAt: 4 });
  assert.equal(replayed.outcome, "REPLAYED");
  assert.equal(replayed.state.checkpoints.get(1)?.replayStatus, "CURRENT");
  assert.equal(replayed.state.observations.get(valid.observationId)?.projectionReference, `replay:current:${valid.observationId}`);
  assert.equal(replayed.state.observations.get(baseObservation().observationId)?.projectionReference, `replay:superseded:${valid.observationId}`);
  assert.equal([...replayed.state.observations.values()].filter((item) => item.finalityState !== "REORGED").length, 1);
});

test("unfinalized replacement remains blocked", () => {
  let state = ingestObservation(createSliceBState(), baseObservation());
  state = advanceFinality(state, 1, 10n, 2);
  const replacement = baseObservation(10n, "replacement-pending", "0xreplacement-pending", "relationship:fixture", "commitment:1", "h9");
  state = ingestObservation(state, replacement);
  const blocked = replayReorg(state, state.observations.get(replacement.observationId)!, { finalizedBlock: 10n, observedAt: 4 });
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
  assert.equal(api.object("evidence:r2", "r1"), null);
});
test("global evidence is visible only to unscoped lookup", () => {
  const global = { evidenceId: "global-object", relationshipId: null, sourceEventId: "source:global", mode: "implemented_local" as const, sourceDomain: "ethereum-sepolia", chainKey: 1, transactionHash: "0xglobal", blockNumber: 1n, attestcoinReference: null, status: "ACCEPTED" as const, linkedCreditcoinTransition: null, sourceReference: "global fixture", reason: null };
  const api = createSliceBApi(recordEvidence(createSliceBState(), global));
  assert.equal(api.evidence("global-object")?.relationshipId, null);
  assert.equal(api.object("global-object", "r1"), null);
  assert.equal((api.object("global-object") as { relationshipId: string | null }).relationshipId, null);
  assert.equal((api.relationship("r1") as { evidence: EvidenceRecord[] }).evidence.length, 0);
});

test("same object IDs remain scoped to both relationships", () => {
  let state = createSliceBState();
  const r1 = { relationshipId: "r1", creditcoinChainId: 102031, contractAddress: "0xcc3-r1", transactionHash: null, blockNumber: null, blockHash: null, objectId: "object:same", state: "ACTIVE", readStatus: "READ" as const, expectedState: "ACTIVE", readAt: 3 };
  const r2 = { ...r1, relationshipId: "r2", contractAddress: "0xcc3-r2" };
  state = recordCanonical(state, r1);
  state = recordCanonical(state, r2);
  assert.equal(state.canonical.size, 2);
  const api = createSliceBApi(state);
  assert.equal((api.relationship("r1") as { canonicalState: Array<{ relationshipId: string }> }).canonicalState[0]?.relationshipId, "r1");
  assert.equal((api.relationship("r2") as { canonicalState: Array<{ relationshipId: string }> }).canonicalState[0]?.relationshipId, "r2");
  const scopedObjectApi = api as unknown as { object(id: string, relationshipId?: string): unknown };
  assert.equal((scopedObjectApi.object("object:same") as { error: string }).error, "AMBIGUOUS_OBJECT_SCOPE");
  assert.equal((scopedObjectApi.object("object:same", "r1") as { canonicalReference: { relationshipId: string } }).canonicalReference.relationshipId, "r1");
  const reversed = recordCanonical(recordCanonical(createSliceBState(), r2), r1);
  assert.equal(snapshotHash(state), snapshotHash(reversed));
  const conflict = recordCanonical(state, { ...r1, state: "CONSUMED" });
  assert.equal([...conflict.canonical.values()].find((item) => item.relationshipId === "r1")?.readStatus, "CONFLICTING");
  assert.equal(snapshotHash(recordCanonical(conflict, { ...r1, state: "CONSUMED" })), snapshotHash(conflict));
});

test("composite canonical identifiers cannot collide at delimiter boundaries", () => {
  const first = { relationshipId: "a:b", creditcoinChainId: 1, contractAddress: "0xfirst", transactionHash: null, blockNumber: null, blockHash: null, objectId: "c", state: "ACTIVE", readStatus: "READ" as const, expectedState: "ACTIVE", readAt: 1 };
  const second = { relationshipId: "a", creditcoinChainId: 1, contractAddress: "0xsecond", transactionHash: null, blockNumber: null, blockHash: null, objectId: "b:c", state: "ACTIVE", readStatus: "READ" as const, expectedState: "ACTIVE", readAt: 1 };
  let state = recordCanonical(createSliceBState(), first);
  state = recordCanonical(state, second);
  assert.equal(state.canonical.size, 2);
  const globalReference = { relationshipId: null, creditcoinChainId: 1, contractAddress: "0xglobal", transactionHash: null, blockNumber: null, blockHash: null, objectId: "same", state: "ACTIVE", readStatus: "READ" as const, expectedState: "ACTIVE", readAt: 1 };
  const namedGlobalReference = { ...globalReference, relationshipId: "global", contractAddress: "0xnamed-global" };
  const scopedState = recordCanonical(recordCanonical(createSliceBState(), globalReference), namedGlobalReference);
  assert.equal(scopedState.canonical.size, 2);
  const api = createSliceBApi(state);
  assert.equal((api.object("c", "a:b") as { canonicalReference: { contractAddress: string } }).canonicalReference.contractAddress, "0xfirst");
  assert.equal((api.object("b:c", "a") as { canonicalReference: { contractAddress: string } }).canonicalReference.contractAddress, "0xsecond");
  assert.notEqual(sourceEventId({ domain: "a|1", chainKey: 2, transactionHash: "b", eventIndex: 0 }), sourceEventId({ domain: "a", chainKey: 1, transactionHash: "2|b", eventIndex: 0 }));
});

test("identical evidence recording is idempotent and conflicting evidence is explicit", () => {
  const evidence = { evidenceId: "evidence:idempotent", relationshipId: "r1", sourceEventId: "source:idempotent", mode: "implemented_local" as const, sourceDomain: "ethereum-sepolia", chainKey: 1, transactionHash: "0xidempotent", blockNumber: 1n, attestcoinReference: "attest:idempotent", status: "ACCEPTED" as const, linkedCreditcoinTransition: "cc3:idempotent", sourceReference: "fixture:idempotent", reason: null };
  const once = recordEvidence(createSliceBState(), evidence);
  const twice = recordEvidence(once, evidence);
  assert.equal(snapshotHash(twice), snapshotHash(once));
  assert.equal(twice.provenance.length, once.provenance.length);
  const restored = restoreSnapshot(snapshot(once));
  assert.equal(snapshotHash(recordEvidence(restored, evidence)), snapshotHash(restored));
  const conflicting = recordEvidence(once, { ...evidence, status: "REJECTED", reason: "different content" });
  assert.equal(conflicting.evidence.get(evidence.evidenceId)?.status, "ACCEPTED");
  assert.equal(conflicting.evidenceConflicts.length, 1);
  assert.equal(conflicting.provenance.length, once.provenance.length);
  assert.equal(snapshotHash(recordEvidence(conflicting, { ...evidence, status: "REJECTED", reason: "different content" })), snapshotHash(conflicting));
});

test("evidence conflicts preserve the original and retain distinct conflict history", () => {
  const original = { evidenceId: "evidence:preserve", relationshipId: "r1", sourceEventId: "source:original", mode: "implemented_local" as const, sourceDomain: "ethereum-sepolia", chainKey: 1, transactionHash: "0xoriginal", blockNumber: 1n, attestcoinReference: "attest:original", status: "ACCEPTED" as const, linkedCreditcoinTransition: null, sourceReference: "fixture:original", reason: null };
  const conflictOne = { ...original, relationshipId: "r2", sourceEventId: "source:conflict-one", transactionHash: "0xconflict-one", status: "REJECTED" as const, reason: "wrong source" };
  const conflictTwo = { ...original, relationshipId: "r3", sourceEventId: "source:conflict-two", transactionHash: "0xconflict-two", status: "PENDING" as const, reason: null };
  let state = recordEvidence(createSliceBState(), original);
  state = recordEvidence(state, conflictOne);
  state = recordEvidence(state, conflictTwo);
  assert.deepEqual(state.evidence.get(original.evidenceId), original);
  assert.equal(state.evidenceConflicts.length, 2);
  assert.deepEqual(state.evidenceConflicts.map((conflict) => conflict.conflictingRelationshipId).sort(), ["r2", "r3"]);
  let reversed = recordEvidence(createSliceBState(), original);
  reversed = recordEvidence(reversed, conflictTwo);
  reversed = recordEvidence(reversed, conflictOne);
  assert.deepEqual(state.evidenceConflicts.map((conflict) => conflict.id), reversed.evidenceConflicts.map((conflict) => conflict.id));
  const restored = restoreSnapshot(snapshot(state));
  assert.equal(snapshotHash(restored), snapshotHash(state));
  state = recordEvidence(state, conflictOne);
  assert.equal(state.evidenceConflicts.length, 2);
});

test("replay fails closed without trusted canonical history", () => {
  let state = ingestObservation(createSliceBState(), baseObservation());
  state = advanceFinality(state, 1, 10n, 2);
  const replacement = baseObservation(10n, "replacement-no-history", "0xreplacement-no-history", "relationship:fixture", "commitment:1", "h9");
  state = ingestObservation(state, replacement);
  state = advanceFinality(state, 1, 10n, 3);
  const noHistory = { ...state, blockHistory: new Map() };
  const blocked = replayReorg(noHistory, noHistory.observations.get(replacement.observationId)!, { finalizedBlock: 10n, observedAt: 4 });
  assert.equal(blocked.outcome, "BLOCKED");
  assert.equal(blocked.state.checkpoints.get(1)?.replayStatus, "REPLAY_REQUIRED");
  assert.equal(blocked.state.observations.get(baseObservation().observationId)?.finalityState, "REORGED");
  assert.equal(blocked.state.observations.get(replacement.observationId)?.projectionReference?.startsWith("reorg:candidate:"), true);
});

test("replay rejects missing, superseded, parentless, or mismatched trusted headers", () => {
  function fixture() {
    let state = ingestObservation(createSliceBState(), baseObservation());
    state = advanceFinality(state, 1, 10n, 2);
    const replacement = baseObservation(10n, "replacement-trusted-header", "0xreplacement-trusted-header", "relationship:fixture", "commitment:1", "h9");
    state = ingestObservation(state, replacement);
    state = advanceFinality(state, 1, 10n, 3);
    return { state, replacement };
  }
  const oldKey = (state: ReturnType<typeof createSliceBState>): string => [...state.blockHistory.entries()].find(([, header]) => header.blockHash === "h10")![0];
  const cases = [
    ["missing header", (state: ReturnType<typeof createSliceBState>) => { const blockHistory = new Map(state.blockHistory); blockHistory.delete(oldKey(state)); return { ...state, blockHistory }; }],
    ["superseded header", (state: ReturnType<typeof createSliceBState>) => { const blockHistory = new Map(state.blockHistory); blockHistory.set(oldKey(state), { ...blockHistory.get(oldKey(state))!, status: "SUPERSEDED" }); return { ...state, blockHistory }; }],
    ["missing parent", (state: ReturnType<typeof createSliceBState>) => { const blockHistory = new Map(state.blockHistory); blockHistory.set(oldKey(state), { ...blockHistory.get(oldKey(state))!, parentBlockHash: null }); return { ...state, blockHistory }; }],
    ["checkpoint parent mismatch", (state: ReturnType<typeof createSliceBState>) => { const checkpoints = new Map(state.checkpoints); checkpoints.set(1, { ...checkpoints.get(1)!, replayParentBlockHash: "not-h9" }); return { ...state, checkpoints }; }],
    ["header metadata mismatch", (state: ReturnType<typeof createSliceBState>) => { const blockHistory = new Map(state.blockHistory); blockHistory.set(oldKey(state), { ...blockHistory.get(oldKey(state))!, chainId: 999999 }); return { ...state, blockHistory }; }],
  ] as const;
  for (const [label, mutate] of cases) {
    const { state, replacement } = fixture();
    const blocked = replayReorg(mutate(state), mutate(state).observations.get(replacement.observationId)!, { finalizedBlock: 10n, observedAt: 4 });
    assert.equal(blocked.outcome, "BLOCKED", label);
    assert.equal(blocked.state.checkpoints.get(1)?.replayStatus, "REPLAY_REQUIRED", label);
  }
});

test("replay rejects a wrong stored old block hash", () => {
  let state = ingestObservation(createSliceBState(), baseObservation());
  state = advanceFinality(state, 1, 10n, 2);
  const replacement = baseObservation(10n, "replacement-wrong-old-hash", "0xreplacement-wrong-old-hash", "relationship:fixture", "commitment:1", "h9");
  state = ingestObservation(state, replacement);
  state = advanceFinality(state, 1, 10n, 3);
  const checkpoints = new Map(state.checkpoints);
  checkpoints.set(1, { ...checkpoints.get(1)!, replayOldBlockHash: "wrong-old-hash" });
  const blocked = replayReorg({ ...state, checkpoints }, state.observations.get(replacement.observationId)!, { finalizedBlock: 10n, observedAt: 4 });
  assert.equal(blocked.outcome, "BLOCKED");
  assert.equal(blocked.attempt?.reason, "trusted canonical block header is unavailable");
  assert.equal(blocked.state.checkpoints.get(1)?.replayStatus, "REPLAY_REQUIRED");
});

test("finality is monotonic and equal stale inputs are idempotent", () => {
  let state = ingestObservation(createSliceBState(), baseObservation());
  state = advanceFinality(state, 1, 10n, 2);
  const finalized = state;
  state = advanceFinality(state, 1, 5n, 3);
  assert.equal(state.checkpoints.get(1)?.lastFinalizedBlock, 10n);
  assert.equal(state.observations.get(baseObservation().observationId)?.finalityState, "FINALIZED");
  assert.equal(snapshotHash(state), snapshotHash(finalized));
  const equal = advanceFinality(state, 1, 10n, 4);
  assert.equal(snapshotHash(equal), snapshotHash(state));
});


test("invalid negative finality is a safe no-op", () => {
  let state = ingestObservation(createSliceBState(), baseObservation());
  state = advanceFinality(state, 1, 10n, 2);
  const before = snapshotHash(state);
  const after = advanceFinality(state, 1, -1n, 3);
  assert.equal(snapshotHash(after), before);
  assert.equal(after.checkpoints.get(1)?.lastFinalizedBlock, 10n);
});

test("replay rejects negative finality input without promotion", () => {
  let state = ingestObservation(createSliceBState(), baseObservation());
  state = advanceFinality(state, 1, 10n, 2);
  const replacement = baseObservation(10n, "replacement-negative-finality", "0xreplacement-negative-finality", "relationship:fixture", "commitment:1", "h9");
  state = ingestObservation(state, replacement);
  state = advanceFinality(state, 1, 10n, 3);
  const blocked = replayReorg(state, state.observations.get(replacement.observationId)!, { finalizedBlock: -1n, observedAt: 4 });
  assert.equal(blocked.outcome, "BLOCKED");
  assert.equal(blocked.state.checkpoints.get(1)?.replayStatus, "REPLAY_REQUIRED");
});

test("sparse event cursor semantics allow gaps but replay still needs indexed headers", () => {
  let state = ingestObservation(createSliceBState(), baseObservation(12n, "h12", "0xgap", "relationship:gap", "commitment:gap", "h11"));
  state = advanceFinality(state, 1, 12n, 2);
  const checkpoint = state.checkpoints.get(1)! as typeof state.checkpoints extends ReadonlyMap<number, infer C> ? C : never;
  assert.equal(checkpoint.lastObservedBlock, 12n);
  assert.equal(checkpoint.lastFinalizedBlock, 12n);
  assert.equal((checkpoint as { cursorMode?: string }).cursorMode, "SPARSE_EVENT");
  assert.equal(state.blockHistory.size, 1);
});

test("earlier indexed event reorg replays against its own trusted old block hash", () => {
  let state = createSliceBState();
  const original10 = baseObservation(10n, "h10", "0xoriginal10", "relationship:earlier", "commitment:earlier-10", "h9", 1, 11155111, "ethereum-sepolia", "test", "slice-b-observation-v1", 0);
  const original11 = baseObservation(11n, "h11", "0xoriginal11", "relationship:earlier", "commitment:earlier-11", "h10", 1, 11155111, "ethereum-sepolia", "test", "slice-b-observation-v1", 1);
  state = ingestObservation(state, original10);
  state = advanceFinality(state, 1, 10n, 2);
  state = ingestObservation(state, original11);
  state = advanceFinality(state, 1, 11n, 3);
  const replacement = baseObservation(10n, "replacement-h10", "0xreplacement10", "relationship:earlier", "commitment:earlier-10", "h9", 1, 11155111, "ethereum-sepolia", "test", "slice-b-observation-v1", 2);
  state = ingestObservation(state, replacement);
  const laterReplacement = baseObservation(11n, "replacement-h11", "0xreplacement11", "relationship:earlier", "commitment:earlier-11", "replacement-h10", 1, 11155111, "ethereum-sepolia", "test", "slice-b-observation-v1", 3);
  state = ingestObservation(state, laterReplacement);
  assert.equal(state.observations.get(laterReplacement.observationId)?.finalityState, "FINALITY_PENDING");
  assert.equal(state.checkpoints.get(1)?.replayFromBlock, 10n);
  assert.equal((state.checkpoints.get(1) as { replayOldBlockHash?: string | null }).replayOldBlockHash, "h10");
  assert.equal(state.checkpoints.get(1)?.replayStatus, "REPLAY_REQUIRED");
  assert.equal((state.checkpoints.get(1) as { replayReason?: string | null }).replayReason, null);
  state = advanceFinality(state, 1, 11n, 4);
  const replayed = replayReorg(state, state.observations.get(replacement.observationId)!, { finalizedBlock: 11n, observedAt: 5 });
  assert.equal(replayed.outcome, "REPLAYED");
  assert.equal(replayed.state.checkpoints.get(1)?.lastObservedBlock, 11n);
  assert.equal(replayed.state.checkpoints.get(1)?.lastObservedBlockHash, "h11");
  assert.equal(replayed.state.checkpoints.get(1)?.replayStatus, "REPLAY_REQUIRED");
  assert.equal((replayed.state.checkpoints.get(1) as { replayReason?: string | null }).replayReason, "additional replacement observations required for affected indexed range");
  assert.equal(replayed.state.observations.get(original11.observationId)?.finalityState, "REORGED");
  assert.equal([...replayed.state.blockHistory.values()].find((header) => header.blockHash === "h11")?.status, "SUPERSEDED");
  const restored = restoreSnapshot(snapshot(replayed.state));
  assert.equal(snapshotHash(restored), snapshotHash(replayed.state));
  assert.equal((restored.checkpoints.get(1) as { replayReason?: string | null }).replayReason, "additional replacement observations required for affected indexed range");
});

test("successful replay cannot regress an already higher finality checkpoint", () => {
  let state = createSliceBState();
  const original10 = baseObservation(10n, "h10", "0xoriginal10-stale", "relationship:stale-finality", "commitment:stale-finality", "h9", 1, 11155111, "ethereum-sepolia", "test", "slice-b-observation-v1", 0);
  const original11 = baseObservation(11n, "h11", "0xoriginal11-stale", "relationship:stale-finality", "commitment:stale-finality-11", "h10", 1, 11155111, "ethereum-sepolia", "test", "slice-b-observation-v1", 1);
  state = ingestObservation(state, original10);
  state = advanceFinality(state, 1, 10n, 2);
  state = ingestObservation(state, original11);
  state = advanceFinality(state, 1, 11n, 3);
  const replacement = baseObservation(10n, "replacement-stale-finality", "0xreplacement-stale-finality", "relationship:stale-finality", "commitment:stale-finality", "h9", 1, 11155111, "ethereum-sepolia", "test", "slice-b-observation-v1", 2);
  state = ingestObservation(state, replacement);
  state = advanceFinality(state, 1, 11n, 4);
  const replayed = replayReorg(state, state.observations.get(replacement.observationId)!, { finalizedBlock: 10n, observedAt: 5 });
  assert.equal(replayed.outcome, "REPLAYED");
  assert.equal(replayed.state.checkpoints.get(1)?.lastFinalizedBlock, 11n);
});

test("successful replay advances finality when the replay input is higher", () => {
  let state = ingestObservation(createSliceBState(), baseObservation());
  state = advanceFinality(state, 1, 10n, 2);
  const replacement = baseObservation(10n, "replacement-higher-finality", "0xreplacement-higher-finality", "relationship:higher-finality", "commitment:higher-finality", "h9");
  state = ingestObservation(state, replacement);
  state = advanceFinality(state, 1, 10n, 3);
  const replayed = replayReorg(state, state.observations.get(replacement.observationId)!, { finalizedBlock: 12n, observedAt: 4 });
  assert.equal(replayed.outcome, "REPLAYED");
  assert.equal(replayed.state.checkpoints.get(1)?.lastFinalizedBlock, 12n);
});

test("earlier replacement with missing target history remains replay-required and blocked", () => {
  let state = createSliceBState();
  const original10 = baseObservation(10n, "h10", "0xmissing-target10", "relationship:missing-target", "commitment:missing-target", "h9", 1, 11155111, "ethereum-sepolia", "test", "slice-b-observation-v1", 0);
  const original11 = baseObservation(11n, "h11", "0xmissing-target11", "relationship:missing-target", "commitment:missing-target-11", "h10", 1, 11155111, "ethereum-sepolia", "test", "slice-b-observation-v1", 1);
  state = ingestObservation(state, original10);
  state = advanceFinality(state, 1, 10n, 2);
  state = ingestObservation(state, original11);
  state = advanceFinality(state, 1, 11n, 3);
  const blockHistory = new Map(state.blockHistory);
  for (const [key, header] of blockHistory) if (header.blockHash === "h10") blockHistory.delete(key);
  state = { ...state, blockHistory };
  const replacement = baseObservation(10n, "replacement-missing-target", "0xreplacement-missing-target", "relationship:missing-target", "commitment:missing-target", "h9", 1, 11155111, "ethereum-sepolia", "test", "slice-b-observation-v1", 2);
  state = ingestObservation(state, replacement);
  assert.equal(state.checkpoints.get(1)?.replayStatus, "REPLAY_REQUIRED");
  assert.equal(state.checkpoints.get(1)?.replayOldBlockHash, null);
  state = advanceFinality(state, 1, 11n, 4);
  const blocked = replayReorg(state, state.observations.get(replacement.observationId)!, { finalizedBlock: 11n, observedAt: 5 });
  assert.equal(blocked.outcome, "BLOCKED");
  assert.equal(blocked.state.checkpoints.get(1)?.replayStatus, "REPLAY_REQUIRED");
});

test("multiple replacement events at one block preserve the other replacement candidate", () => {
  let state = createSliceBState();
  const originalOne = baseObservation(10n, "h10", "0xoriginal-one", "relationship:multi-replacement", "commitment:original-one", "h9", 1, 11155111, "ethereum-sepolia", "test", "slice-b-observation-v1", 0);
  const originalTwo = baseObservation(10n, "h10", "0xoriginal-two", "relationship:multi-replacement", "commitment:original-two", "h9", 1, 11155111, "ethereum-sepolia", "test", "slice-b-observation-v1", 1);
  state = ingestObservation(state, originalOne);
  state = advanceFinality(state, 1, 10n, 2);
  state = ingestObservation(state, originalTwo);
  const replacementOne = baseObservation(10n, "replacement-h10", "0xreplacement-one", "relationship:multi-replacement", "commitment:replacement-one", "h9", 1, 11155111, "ethereum-sepolia", "test", "slice-b-observation-v1", 2);
  state = ingestObservation(state, replacementOne);
  const replacementTwo = baseObservation(10n, "replacement-h10", "0xreplacement-two", "relationship:multi-replacement", "commitment:replacement-two", "h9", 1, 11155111, "ethereum-sepolia", "test", "slice-b-observation-v1", 3);
  state = ingestObservation(state, replacementTwo);
  assert.equal(state.observations.get(replacementOne.observationId)?.finalityState, "FINALITY_PENDING");
  assert.equal(state.observations.get(replacementTwo.observationId)?.finalityState, "FINALITY_PENDING");
  state = advanceFinality(state, 1, 10n, 3);
  const replayed = replayReorg(state, state.observations.get(replacementOne.observationId)!, { finalizedBlock: 10n, observedAt: 4 });
  assert.equal(replayed.outcome, "REPLAYED");
  assert.notEqual(replayed.state.observations.get(replacementTwo.observationId)?.finalityState, "REORGED");
});

test("global evidence IDs reject cross-relationship conflicts without leaking scope", () => {
  const first = { evidenceId: "evidence:global", relationshipId: "r1", sourceEventId: "source:r1", mode: "implemented_local" as const, sourceDomain: "ethereum-sepolia", chainKey: 1, transactionHash: "0xr1", blockNumber: 1n, attestcoinReference: "attest:r1", status: "ACCEPTED" as const, linkedCreditcoinTransition: null, sourceReference: "fixture:r1", reason: null };
  const conflicting = { ...first, relationshipId: "r2", sourceEventId: "source:r2", transactionHash: "0xr2" };
  let state = recordEvidence(createSliceBState(), first);
  state = recordEvidence(state, conflicting);
  const api = createSliceBApi(state);
  assert.equal(state.evidence.get("evidence:global")?.relationshipId, "r1");
  assert.equal(state.evidence.get("evidence:global")?.status, "ACCEPTED");
  assert.equal(state.evidenceConflicts.length, 1);
  assert.equal((api.relationship("r1") as { evidence: EvidenceRecord[] }).evidence[0]?.relationshipId, "r1");
  assert.equal((api.relationship("r2") as { evidence: EvidenceRecord[] }).evidence.length, 0);
  assert.equal(api.investigations("r2").some((item) => (item as { relationshipId?: string }).relationshipId === "r2"), true);
});

test("evidence conflict investigations are visible to both affected relationships", () => {
  const original = { evidenceId: "evidence:scope-conflict", relationshipId: "r1", sourceEventId: "source:scope-r1", mode: "implemented_local" as const, sourceDomain: "ethereum-sepolia", chainKey: 1, transactionHash: "0xscope-r1", blockNumber: 1n, attestcoinReference: "attest:scope-r1", status: "ACCEPTED" as const, linkedCreditcoinTransition: null, sourceReference: "fixture:scope-r1", reason: null };
  const conflicting = { ...original, relationshipId: "r2", sourceEventId: "source:scope-r2", transactionHash: "0xscope-r2" };
  const state = recordEvidence(recordEvidence(createSliceBState(), original), conflicting);
  const api = createSliceBApi(state);
  assert.equal(api.investigations("r1").some((item) => (item as { evidenceId?: string }).evidenceId === original.evidenceId), true);
  assert.equal(api.investigations("r2").some((item) => (item as { evidenceId?: string }).evidenceId === original.evidenceId), true);
  assert.equal(api.investigations("r3").some((item) => (item as { evidenceId?: string }).evidenceId === original.evidenceId), false);
});

test("relationship-scoped investigations isolate replay attempts and dead letters", () => {
  function blockedFor(relationshipId: string, chainKey: number) {
    let state = ingestObservation(createSliceBState(), baseObservation(10n, `h10-${relationshipId}`, `0x${relationshipId}-old`, relationshipId, `object:${relationshipId}`, "h9", chainKey, chainKey === 1 ? 11155111 : 1, chainKey === 1 ? "ethereum-sepolia" : "ethereum-mainnet"));
    state = advanceFinality(state, chainKey, 10n, 2);
    const candidate = baseObservation(10n, `h10-${relationshipId}-replacement`, `0x${relationshipId}-replacement`, relationshipId, `object:${relationshipId}`, "invalid-parent", chainKey, chainKey === 1 ? 11155111 : 1, chainKey === 1 ? "ethereum-sepolia" : "ethereum-mainnet");
    state = ingestObservation(state, candidate);
    state = advanceFinality(state, chainKey, 10n, 3);
    state = replayReorg(state, state.observations.get(candidate.observationId)!, { finalizedBlock: 10n, observedAt: 4 }).state;
    const malformed = { ...candidate, observationId: `dead:${relationshipId}`, sourceEventId: `dead:${relationshipId}`, transactionHash: "" };
    state = ingestObservation(state, malformed);
    return state;
  }
  const r1 = blockedFor("r1", 1);
  const r2 = blockedFor("r2", 2);
  const globalMalformed = { ...baseObservation(), observationId: "dead:global", sourceEventId: "dead:global", transactionHash: "", relationshipId: undefined } as unknown as ObservationEnvelope;
  const state = {
    ...createSliceBState(),
    observations: new Map([...r1.observations, ...r2.observations]),
    evidence: new Map([...r1.evidence, ...r2.evidence]),
    canonical: new Map([...r1.canonical, ...r2.canonical]),
    provenance: [...r1.provenance, ...r2.provenance],
    reconciliations: new Map([...r1.reconciliations, ...r2.reconciliations]),
    checkpoints: new Map([...r1.checkpoints, ...r2.checkpoints]),
    blockHistory: new Map([...r1.blockHistory, ...r2.blockHistory]),
    replayHistory: [...r1.replayHistory, ...r2.replayHistory],
    graphs: new Map([...r1.graphs, ...r2.graphs]),
    deadLetters: [...r1.deadLetters, ...r2.deadLetters],
  };
  const withGlobal = ingestObservation(state, globalMalformed);
  const api = createSliceBApi(withGlobal);
  const all = api.investigations();
  const onlyR1 = api.investigations("r1");
  const onlyR2 = api.investigations("r2");
  assert.equal(all.some((item) => (item as { relationshipId?: string }).relationshipId === "r1"), true);
  assert.equal(all.some((item) => (item as { relationshipId?: string }).relationshipId === "r2"), true);
  assert.equal(onlyR1.every((item) => (item as { relationshipId?: string | null }).relationshipId === "r1"), true);
  assert.equal(onlyR2.every((item) => (item as { relationshipId?: string | null }).relationshipId === "r2"), true);
  assert.equal(onlyR1.some((item) => (item as { relationshipId?: string }).relationshipId === "r2"), false);
  assert.equal(onlyR2.some((item) => (item as { relationshipId?: string }).relationshipId === "r1"), false);
  assert.equal(all.some((item) => (item as { relationshipId?: string | null }).relationshipId === null), true);
});

test("snapshot restore preserves deterministic state across restart", () => {
  let state = ingestObservation(createSliceBState(), baseObservation());
  state = advanceFinality(state, 1, 10n, 2);
  state = projectRelationship(state, "relationship:fixture");
  const restored = restoreSnapshot(snapshot(state));
  assert.equal(snapshotHash(restored), snapshotHash(state));
});

test("snapshot restore accepts older checkpoints and delimiter-keyed maps", () => {
  let state = ingestObservation(createSliceBState(), baseObservation());
  state = advanceFinality(state, 1, 10n, 2);
  state = recordCanonical(state, { relationshipId: "a:b", creditcoinChainId: 102031, contractAddress: "0xcc3", transactionHash: null, blockNumber: null, blockHash: null, objectId: "c", state: "ACTIVE", readStatus: "READ", expectedState: "ACTIVE", readAt: 2 });
  state = reconcile(state, { relationshipId: "a:b", sourceEventId: "source:legacy", canonicalObjectId: "c", state: "PENDING", observationAmount: "1", canonicalAmount: null, authority: "projection", nextAction: "Wait", recoveryRole: "operator", reason: "legacy" });
  const legacy = JSON.parse(snapshot(state)) as { canonical: [string, Record<string, unknown>][]; blockHistory: [string, Record<string, unknown>][]; checkpoints: [number, Record<string, unknown>][]; reconciliationHistory?: unknown };
  legacy.canonical = legacy.canonical.map(([, reference]) => ["a:b:c", reference]);
  legacy.blockHistory = legacy.blockHistory.map(([, header]) => ["1:10:h10", header]);
  for (const [, checkpoint] of legacy.checkpoints) delete checkpoint.replayOldBlockHash;
  delete legacy.reconciliationHistory;
  const restored = restoreSnapshot(JSON.stringify(legacy));
  assert.equal(restored.canonical.size, 1);
  assert.equal(restored.blockHistory.size, 1);
  assert.equal(restored.reconciliations.size, 1);
  assert.equal(restored.reconciliationHistory.length, 1);
  assert.equal(restored.checkpoints.get(1)?.replayOldBlockHash, null);
  assert.equal(snapshotHash(restored), snapshotHash(state));
});

test("snapshot restore preserves literal strings that resemble bigint values", () => {
  const observation = { ...baseObservation(), normalizedPayload: { amount: "100000", facilityId: "facility:1", literal: "123n" } };
  const state = ingestObservation(createSliceBState(), observation);
  const restored = restoreSnapshot(snapshot(state));
  assert.equal(restored.observations.get(observation.observationId)?.normalizedPayload.literal, "123n");
  assert.equal(typeof restored.observations.get(observation.observationId)?.normalizedPayload.literal, "string");
  assert.equal(snapshotHash(restored), snapshotHash(state));
});

test("canonical serialization and graph hashes are independent of insertion order", () => {
  const first = baseObservation(9n, "h9", "0xfirst", "relationship:fixture", "commitment:same", "h8", 1, 11155111, "ethereum-sepolia", "test", "slice-b-observation-v1", 1);
  const second = baseObservation(10n, "h10", "0xsecond", "relationship:fixture", "commitment:same", "h9", 1, 11155111, "ethereum-sepolia", "test", "slice-b-observation-v1", 2);
  const evidenceOne = { evidenceId: "evidence:determinism:one", relationshipId: "relationship:fixture", sourceEventId: first.sourceEventId, mode: "implemented_local" as const, sourceDomain: "ethereum-sepolia", chainKey: 1, transactionHash: "0xfirst", blockNumber: 9n, attestcoinReference: "attest:one", status: "ACCEPTED" as const, linkedCreditcoinTransition: null, sourceReference: "fixture:one", reason: null };
  const evidenceTwo = { ...evidenceOne, evidenceId: "evidence:determinism:two", sourceEventId: second.sourceEventId, transactionHash: "0xsecond", blockNumber: 10n, attestcoinReference: "attest:two" };
  const canonicalOne = { relationshipId: "relationship:fixture", creditcoinChainId: 102031, contractAddress: "0xcc3-one", transactionHash: null, blockNumber: null, blockHash: null, objectId: "commitment:one", state: "ACTIVE", readStatus: "READ" as const, expectedState: "ACTIVE", readAt: 3 };
  const canonicalTwo = { ...canonicalOne, objectId: "commitment:two", contractAddress: "0xcc3-two" };
  const reconciliationOne = { relationshipId: "relationship:fixture", sourceEventId: first.sourceEventId, canonicalObjectId: "commitment:one", state: "PENDING" as const, observationAmount: "100000", canonicalAmount: null, authority: "projection" as const, nextAction: "Wait", recoveryRole: "operator", reason: "fixture" };
  const reconciliationTwo = { ...reconciliationOne, sourceEventId: second.sourceEventId, canonicalObjectId: "commitment:two" };

  function build(reverse: boolean) {
    let state = createSliceBState();
    const observations = reverse ? [second, first] : [first, second];
    const evidence = reverse ? [evidenceTwo, evidenceOne] : [evidenceOne, evidenceTwo];
    const canonicals = reverse ? [canonicalTwo, canonicalOne] : [canonicalOne, canonicalTwo];
    const reconciliations = reverse ? [reconciliationTwo, reconciliationOne] : [reconciliationOne, reconciliationTwo];
    for (const item of observations) state = ingestObservation(state, item);
    state = advanceFinality(state, 1, 10n, 2);
    for (const item of evidence) state = recordEvidence(state, item);
    for (const item of canonicals) state = recordCanonical(state, item);
    for (const item of reconciliations) state = reconcile(state, item);
    const malformedA = { ...first, observationId: "dead:a", sourceEventId: "dead:a", transactionHash: "" };
    const malformedB = { ...first, observationId: "dead:b", sourceEventId: "dead:b", transactionHash: "" };
    for (const item of reverse ? [malformedB, malformedA] : [malformedA, malformedB]) state = ingestObservation(state, item);
    const replayCandidate = baseObservation(10n, "replacement-determinism", "0xreplay-determinism", "relationship:fixture", "commitment:same", "invalid-parent");
    state = ingestObservation(state, replayCandidate);
    state = advanceFinality(state, 1, 10n, 3);
    state = replayReorg(state, state.observations.get(replayCandidate.observationId)!, { finalizedBlock: 10n, observedAt: 4 }).state;
    return projectRelationship(state, "relationship:fixture");
  }

  const left = build(false);
  const right = build(true);
  assert.equal(snapshot(left), snapshot(right));
  assert.equal(snapshotHash(left), snapshotHash(right));
  assert.equal(left.graphs.get("relationship:fixture")?.projectionHash, right.graphs.get("relationship:fixture")?.projectionHash);
  const restored = restoreSnapshot(snapshot(left));
  assert.equal(snapshotHash(restored), snapshotHash(left));
  const changed = recordCanonical(left, { ...canonicalOne, state: "CONSUMED" });
  assert.notEqual(snapshotHash(changed), snapshotHash(left));
  assert.equal(left.graphs.get("relationship:fixture")?.nodes.filter((node) => node.id === "commitment:same").length, 1);

  const currentBlockHistory = (left as typeof left & { blockHistory?: ReadonlyMap<string, unknown> }).blockHistory ?? new Map();
  const reordered = {
    ...left,
    observations: new Map([...left.observations.entries()].reverse()),
    evidence: new Map([...left.evidence.entries()].reverse()),
    canonical: new Map([...left.canonical.entries()].reverse()),
    provenance: [...left.provenance].reverse(),
    reconciliations: new Map([...left.reconciliations.entries()].reverse()),
    checkpoints: new Map([...left.checkpoints.entries()].reverse()),
    replayHistory: [...left.replayHistory].reverse(),
    graphs: new Map([...left.graphs.entries()].reverse()),
    deadLetters: [...left.deadLetters].reverse(),
    blockHistory: new Map([...currentBlockHistory.entries()].reverse()),
  };
  assert.equal(snapshotHash(reordered), snapshotHash(left));
});
