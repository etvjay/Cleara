function equal(actual: unknown, expected: unknown): void { if (actual !== expected) throw new Error(`assert.equal failed: ${String(actual)} !== ${String(expected)}`); }
function notEqual(actual: unknown, expected: unknown): void { if (actual === expected) throw new Error(`assert.notEqual failed: ${String(actual)} === ${String(expected)}`); }
function deepEqual(actual: unknown, expected: unknown): void { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`assert.deepEqual failed: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`); }
const assert = { equal, notEqual, deepEqual };

import {
  advanceFinality,
  buildRelationshipGraph,
  createSliceBApi,
  createSliceBState,
  ingestObservation,
  observationId,
  projectRelationship,
  recordCanonical,
  recordEvidence,
  reconcile,
  replayReorg,
  snapshot,
  snapshotHash,
  sourceEventId,
  type ObservationEnvelope,
} from "../../workers/multichain-execution/src/index.js";

const relationshipId = "relationship:slice-b:fixture";
const identity = { domain: "ethereum-sepolia", chainKey: 1, transactionHash: "0xsliceb0001", eventIndex: 0 } as const;

function observation(tx: string = identity.transactionHash, blockHash = "slice-b-block-10", parentBlockHash = "slice-b-block-9", relation = relationshipId, objectId = "settlement:slice-b-1"): ObservationEnvelope {
  const source = { ...identity, transactionHash: tx };
  return {
    observationId: observationId(source, "SettlementExecuted"), sourceEventId: sourceEventId(source), relationshipId: relation, objectId, objectType: "Settlement", eventType: "SettlementExecuted", sourceDomain: "ethereum-sepolia", chainKey: 1, chainId: 11155111, contractAddress: "0xsettlement-adapter-fixture", transactionHash: tx, eventIndex: 0, blockNumber: 10n, blockHash, parentBlockHash, observedAt: 100, normalizedPayload: { amount: "340000", debtor: "party:debtor", creditor: "party:creditor", asset: "USD" }, payloadSchemaVersion: "slice-b-observation-v1", observationState: "OBSERVED", finalityState: "UNKNOWN", evidenceId: null, creditcoinReference: null, projectionReference: null, reconciliationReference: null, evidenceMode: "fixture_from_live_evidence", adapterVersion: "slice-b-demo-v1", createdAt: 100, updatedAt: 100,
  };
}

function baseState(): ReturnType<typeof createSliceBState> {
  let state = ingestObservation(createSliceBState(), observation());
  state = advanceFinality(state, 1, 10n, 101);
  return state;
}

function happyPath() {
  let state = baseState();
  state = recordEvidence(state, { evidenceId: "evidence:slice-b-settlement", relationshipId, sourceEventId: sourceEventId(identity), mode: "fixture_from_live_evidence", sourceDomain: "ethereum-sepolia", chainKey: 1, transactionHash: identity.transactionHash, blockNumber: 10n, attestcoinReference: "attestcoin:fixture:m11", status: "ACCEPTED", linkedCreditcoinTransition: "cc3:reconciliation:fixture", sourceReference: "M11 settlement evidence", reason: null });
  state = recordCanonical(state, { relationshipId, creditcoinChainId: 102031, contractAddress: "0xsettlement-reconciler-fixture", transactionHash: "0xcc3fixture", blockNumber: 20n, blockHash: "cc3-block-20", objectId: "settlement:slice-b-1", state: "RECONCILED", readStatus: "READ", expectedState: "RECONCILED", readAt: 102 });
  state = reconcile(state, { relationshipId, sourceEventId: sourceEventId(identity), canonicalObjectId: "settlement:slice-b-1", state: "RECONCILED", observationAmount: "340000", canonicalAmount: "340000", authority: "creditcoin", nextAction: "No action", recoveryRole: "auditor", reason: "source, evidence, and canonical state agree" });
  state = projectRelationship(state, relationshipId);
  const api = createSliceBApi(state);
  assert.equal(api.evidence("evidence:slice-b-settlement")?.status, "ACCEPTED");
  assert.equal((api.relationship(relationshipId) as { canonical: boolean }).canonical, false);
  return { scenario: "happy_path", evidenceMode: "fixture_from_live_evidence", state: "RECONCILED", snapshotHash: snapshotHash(state) };
}

function pendingProof() {
  let state = baseState();
  state = recordEvidence(state, { evidenceId: "evidence:slice-b-pending", relationshipId, sourceEventId: sourceEventId(identity), mode: "implemented_local", sourceDomain: "ethereum-sepolia", chainKey: 1, transactionHash: identity.transactionHash, blockNumber: 10n, attestcoinReference: null, status: "PENDING", linkedCreditcoinTransition: null, sourceReference: "local pending-proof scenario", reason: "Attestcoin evidence not accepted" });
  state = reconcile(state, { relationshipId, sourceEventId: sourceEventId(identity), canonicalObjectId: null, state: "PENDING", observationAmount: "340000", canonicalAmount: null, authority: "attestcoin", nextAction: "Wait for proof acceptance", recoveryRole: "evidence operator", reason: "settlement observed and finalized, proof pending" });
  const investigations = createSliceBApi(state).investigations();
  assert.equal(investigations.length > 0, true);
  return { scenario: "pending_proof", evidenceMode: "implemented_local", state: "PENDING_PROOF", blocked: "Creditcoin reconciliation", nextAction: "Wait for proof acceptance" };
}

function mismatch() {
  let state = baseState();
  state = recordCanonical(state, { relationshipId, creditcoinChainId: 102031, contractAddress: "0xsettlement-reconciler-fixture", transactionHash: "0xcc3fixture-mismatch", blockNumber: 20n, blockHash: "cc3-block-20", objectId: "settlement:slice-b-1", state: "RECONCILED", readStatus: "CONFLICTING", expectedState: "RECONCILED", readAt: 102 });
  state = reconcile(state, { relationshipId, sourceEventId: sourceEventId(identity), canonicalObjectId: "settlement:slice-b-1", state: "MISMATCH", observationAmount: "340000", canonicalAmount: "339000", authority: "creditcoin", nextAction: "Pause and reconcile amount", recoveryRole: "reconciliation operator", reason: "source amount differs from canonical amount" });
  const investigations = createSliceBApi(state).investigations();
  assert.equal(investigations.some((item) => (item as { state?: string }).state === "MISMATCH"), true);
  return { scenario: "mismatch", evidenceMode: "implemented_local", state: "MISMATCH" };
}

function reorgAndReplay() {
  let state = baseState();
  const invalidCandidate = observation("0xsliceb-invalid", "slice-b-invalid-parent", "invalid-parent");
  state = ingestObservation(state, invalidCandidate);
  state = advanceFinality(state, 1, 10n, 102);
  const invalidReplay = replayReorg(state, state.observations.get(invalidCandidate.observationId)!, { finalizedBlock: 10n, observedAt: 102 });
  assert.equal(invalidReplay.outcome, "BLOCKED");
  assert.equal(invalidReplay.state.checkpoints.get(1)?.replayStatus, "REPLAY_REQUIRED");

  state = baseState();
  const replacement = observation("0xsliceb-replacement", "slice-b-replacement-block-10");
  state = ingestObservation(state, replacement);
  assert.equal(state.checkpoints.get(1)?.replayStatus, "REPLAY_REQUIRED");
  state = advanceFinality(state, 1, 10n, 102);
  assert.equal(state.checkpoints.get(1)?.replayStatus, "REPLAY_REQUIRED");
  const replayed = replayReorg(state, replacement, { finalizedBlock: 10n, observedAt: 103 });
  assert.equal(replayed.outcome, "REPLAYED");
  assert.equal(replayed.state.checkpoints.get(1)?.replayStatus, "CURRENT");
  assert.equal(replayed.state.observations.get(observationId(identity, "SettlementExecuted"))?.finalityState, "REORGED");
  assert.equal(replayed.state.observations.get(replacement.observationId)?.finalityState, "FINALIZED");
  const second = replayReorg(replayed.state, replacement, { finalizedBlock: 10n, observedAt: 104 });
  assert.equal(second.outcome, "NOOP");
  assert.equal("write" in createSliceBApi(replayed.state), false);
  return { scenario: "reorg_and_replay", evidenceMode: "implemented_local", invalidReplay: invalidReplay.outcome, checkpointBeforeReplay: "REPLAY_REQUIRED", checkpointAfterReplay: replayed.state.checkpoints.get(1)?.replayStatus, oldObservationRetained: true, snapshotHash: snapshotHash(replayed.state) };
}

function relationshipScope() {
  let state = createSliceBState();
  state = recordEvidence(state, { evidenceId: "evidence:r1", relationshipId: "r1", sourceEventId: "source:r1", mode: "implemented_local", sourceDomain: "ethereum-sepolia", chainKey: 1, transactionHash: "0xr1", blockNumber: 1n, attestcoinReference: "attest:r1", status: "ACCEPTED", linkedCreditcoinTransition: null, sourceReference: "fixture:r1", reason: null });
  state = recordEvidence(state, { evidenceId: "evidence:r2", relationshipId: "r2", sourceEventId: "source:r2", mode: "implemented_local", sourceDomain: "ethereum-sepolia", chainKey: 1, transactionHash: "0xr2", blockNumber: 2n, attestcoinReference: "attest:r2", status: "PENDING", linkedCreditcoinTransition: null, sourceReference: "fixture:r2", reason: null });
  state = recordCanonical(state, { relationshipId: "r1", creditcoinChainId: 102031, contractAddress: "0xcc3-r1", transactionHash: null, blockNumber: null, blockHash: null, objectId: "object:r1", state: "ACTIVE", readStatus: "READ", expectedState: "ACTIVE", readAt: 3 });
  state = recordCanonical(state, { relationshipId: "r2", creditcoinChainId: 102031, contractAddress: "0xcc3-r2", transactionHash: null, blockNumber: null, blockHash: null, objectId: "object:r2", state: "ACTIVE", readStatus: "READ", expectedState: "ACTIVE", readAt: 3 });
  const r1 = createSliceBApi(state).relationship("r1") as { evidence: Array<{ evidenceId: string }>; canonicalState: Array<{ objectId: string }> };
  assert.deepEqual(r1.evidence.map((item) => item.evidenceId), ["evidence:r1"]);
  assert.deepEqual(r1.canonicalState.map((item) => item.objectId), ["object:r1"]);
  return { scenario: "relationship_scope", evidenceMode: "implemented_local", r1Evidence: r1.evidence.length, r1Canonical: r1.canonicalState.length };
}

function determinism() {
  const first = observation("0xone", "block-one", "block-zero", relationshipId, "settlement:one");
  const second = observation("0xtwo", "block-two", "block-one", relationshipId, "settlement:two");
  let left = ingestObservation(createSliceBState(), first); left = ingestObservation(left, second); left = advanceFinality(left, 1, 10n, 1); left = projectRelationship(left, relationshipId);
  let right = ingestObservation(createSliceBState(), second); right = ingestObservation(right, first); right = advanceFinality(right, 1, 10n, 1); right = projectRelationship(right, relationshipId);
  assert.equal(snapshot(left), snapshot(right));
  assert.equal(snapshotHash(left), snapshotHash(right));
  assert.equal(buildRelationshipGraph(left, relationshipId).projectionHash, buildRelationshipGraph(right, relationshipId).projectionHash);
  const changed = ingestObservation(createSliceBState(), { ...first, normalizedPayload: { amount: "1" } });
  assert.notEqual(snapshotHash(left), snapshotHash(changed));
  return { scenario: "determinism", evidenceMode: "implemented_local", equalInsertionOrderHashes: true, meaningfulChangeChangesHash: true };
}

const result = { schemaVersion: "slice-b-demo-v2", relationshipId, scenarios: [happyPath(), pendingProof(), mismatch(), reorgAndReplay(), relationshipScope(), determinism()], limitations: ["local deterministic read model", "no live provider", "no canonical mutation", "historical evidence remains separate"] };
console.log(JSON.stringify(result, (_, value) => typeof value === "bigint" ? `${value}n` : value, 2));
