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

test("identical evidence recording is idempotent and conflicting evidence is explicit", () => {
  const evidence = { evidenceId: "evidence:idempotent", relationshipId: "r1", sourceEventId: "source:idempotent", mode: "implemented_local" as const, sourceDomain: "ethereum-sepolia", chainKey: 1, transactionHash: "0xidempotent", blockNumber: 1n, attestcoinReference: "attest:idempotent", status: "ACCEPTED" as const, linkedCreditcoinTransition: "cc3:idempotent", sourceReference: "fixture:idempotent", reason: null };
  const once = recordEvidence(createSliceBState(), evidence);
  const twice = recordEvidence(once, evidence);
  assert.equal(snapshotHash(twice), snapshotHash(once));
  assert.equal(twice.provenance.length, once.provenance.length);
  const restored = restoreSnapshot(snapshot(once));
  assert.equal(snapshotHash(recordEvidence(restored, evidence)), snapshotHash(restored));
  const conflicting = recordEvidence(once, { ...evidence, status: "REJECTED", reason: "different content" });
  assert.equal(conflicting.evidence.get(evidence.evidenceId)?.status, "REJECTED");
  assert.equal(conflicting.provenance.length, once.provenance.length);
  assert.equal(snapshotHash(recordEvidence(conflicting, { ...evidence, status: "REJECTED", reason: "different content" })), snapshotHash(conflicting));
});

test("snapshot restore preserves deterministic state across restart", () => {
  let state = ingestObservation(createSliceBState(), baseObservation());
  state = advanceFinality(state, 1, 10n, 2);
  state = projectRelationship(state, "relationship:fixture");
  const restored = restoreSnapshot(snapshot(state));
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
