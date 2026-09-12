import {
  advanceFinality,
  createSliceBApi,
  createSliceBState,
  ingestObservation,
  observationId,
  projectRelationship,
  recordCanonical,
  recordEvidence,
  reconcile,
  snapshotHash,
  sourceEventId,
  type ObservationEnvelope,
} from "../../workers/multichain-execution/src/index.js";

const relationshipId = "relationship:slice-b:fixture";
const identity = { domain: "ethereum-sepolia", chainKey: 1, transactionHash: "0xsliceb0001", eventIndex: 0 } as const;

function observation(tx: string = identity.transactionHash, blockHash = "slice-b-block-10"): ObservationEnvelope {
  const source = { ...identity, transactionHash: tx };
  return {
    observationId: observationId(source, "SettlementExecuted"),
    sourceEventId: sourceEventId(source),
    relationshipId,
    objectId: "settlement:slice-b-1",
    objectType: "Settlement",
    eventType: "SettlementExecuted",
    sourceDomain: "ethereum-sepolia",
    chainKey: 1,
    chainId: 11155111,
    contractAddress: "0xsettlement-adapter-fixture",
    transactionHash: tx,
    eventIndex: 0,
    blockNumber: 10n,
    blockHash,
    parentBlockHash: "slice-b-block-9",
    observedAt: 100,
    normalizedPayload: { amount: "340000", debtor: "party:debtor", creditor: "party:creditor", asset: "USD" },
    payloadSchemaVersion: "slice-b-observation-v1",
    observationState: "OBSERVED",
    finalityState: "UNKNOWN",
    evidenceId: null,
    creditcoinReference: null,
    projectionReference: null,
    reconciliationReference: null,
    evidenceMode: "fixture_from_live_evidence",
    adapterVersion: "slice-b-demo-v1",
    createdAt: 100,
    updatedAt: 100,
  };
}

function baseState(): ReturnType<typeof createSliceBState> {
  let state = ingestObservation(createSliceBState(), observation());
  state = advanceFinality(state, 1, 10n, 101);
  return state;
}

function happyPath() {
  let state = baseState();
  state = recordEvidence(state, { evidenceId: "evidence:slice-b-settlement", sourceEventId: sourceEventId(identity), mode: "fixture_from_live_evidence", sourceDomain: "ethereum-sepolia", chainKey: 1, transactionHash: identity.transactionHash, blockNumber: 10n, attestcoinReference: "attestcoin:fixture:m11", status: "ACCEPTED", linkedCreditcoinTransition: "cc3:reconciliation:fixture", sourceReference: "M11 settlement evidence", reason: null });
  state = recordCanonical(state, { creditcoinChainId: 102031, contractAddress: "0xsettlement-reconciler-fixture", transactionHash: "0xcc3fixture", blockNumber: 20n, blockHash: "cc3-block-20", objectId: "settlement:slice-b-1", state: "RECONCILED", readStatus: "READ", expectedState: "RECONCILED", readAt: 102 });
  state = reconcile(state, { relationshipId, sourceEventId: sourceEventId(identity), canonicalObjectId: "settlement:slice-b-1", state: "RECONCILED", observationAmount: "340000", canonicalAmount: "340000", authority: "creditcoin", nextAction: "No action", recoveryRole: "auditor", reason: "source, evidence, and canonical state agree" });
  state = projectRelationship(state, relationshipId);
  return { scenario: "happy_path", evidenceMode: "fixture_from_live_evidence", state: "RECONCILED", api: createSliceBApi(state).relationship(relationshipId), snapshotHash: snapshotHash(state) };
}

function pendingProof() {
  let state = baseState();
  state = recordEvidence(state, { evidenceId: "evidence:slice-b-pending", sourceEventId: sourceEventId(identity), mode: "implemented_local", sourceDomain: "ethereum-sepolia", chainKey: 1, transactionHash: identity.transactionHash, blockNumber: 10n, attestcoinReference: null, status: "PENDING", linkedCreditcoinTransition: null, sourceReference: "local pending-proof scenario", reason: "Attestcoin evidence not accepted" });
  state = reconcile(state, { relationshipId, sourceEventId: sourceEventId(identity), canonicalObjectId: null, state: "PENDING", observationAmount: "340000", canonicalAmount: null, authority: "attestcoin", nextAction: "Wait for proof acceptance", recoveryRole: "evidence operator", reason: "settlement observed and finalized, proof pending" });
  return { scenario: "pending_proof", evidenceMode: "implemented_local", state: "PENDING_PROOF", blocked: "Creditcoin reconciliation", nextAction: "Wait for proof acceptance", api: createSliceBApi(state).investigations() };
}

function mismatch() {
  let state = baseState();
  state = recordCanonical(state, { creditcoinChainId: 102031, contractAddress: "0xsettlement-reconciler-fixture", transactionHash: "0xcc3fixture-mismatch", blockNumber: 20n, blockHash: "cc3-block-20", objectId: "settlement:slice-b-1", state: "RECONCILED", readStatus: "CONFLICTING", expectedState: "RECONCILED", readAt: 102 });
  state = reconcile(state, { relationshipId, sourceEventId: sourceEventId(identity), canonicalObjectId: "settlement:slice-b-1", state: "MISMATCH", observationAmount: "340000", canonicalAmount: "339000", authority: "creditcoin", nextAction: "Pause and reconcile amount", recoveryRole: "reconciliation operator", reason: "source amount differs from canonical amount" });
  return { scenario: "mismatch", evidenceMode: "implemented_local", state: "MISMATCH", api: createSliceBApi(state).investigations() };
}

function reorgAndReplay() {
  let state = baseState();
  const replacement = observation("0xsliceb-replacement", "slice-b-replacement-block-10");
  state = ingestObservation(state, replacement);
  const beforeReplay = state.checkpoints.get(1)?.replayStatus;
  state = projectRelationship(state, relationshipId);
  const replayed = JSON.parse(createSliceBApi(state).snapshot().body) as { observations: unknown[] };
  return { scenario: "reorg_and_replay", evidenceMode: "implemented_local", checkpointBeforeReplay: beforeReplay, oldObservationRetained: replayed.observations.length >= 1, snapshotHash: snapshotHash(state) };
}

console.log(JSON.stringify({ schemaVersion: "slice-b-demo-v1", relationshipId, scenarios: [happyPath(), pendingProof(), mismatch(), reorgAndReplay()], limitations: ["local deterministic read model", "no live provider", "no canonical mutation", "historical evidence remains separate"] }, (_, value) => typeof value === "bigint" ? `${value}n` : value, 2));
