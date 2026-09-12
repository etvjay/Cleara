import assert from "node:assert/strict";
import {
  advanceFinality,
  buildRelationshipGraph,
  createSliceBState,
  ingestObservation,
  observationId,
  projectRelationship,
  recordEvidence,
  reconcile,
  replayReorg,
  restoreSnapshot,
  snapshot,
  snapshotHash,
  sourceEventId,
} from "../../workers/multichain-execution/src/slice-b.ts";

const identity = (transactionHash, eventIndex = 0) => ({ domain: "ethereum-sepolia", chainKey: 1, transactionHash, eventIndex });
const observation = ({ blockNumber = 10n, blockHash = `h${blockNumber}`, transactionHash = "0xadv", relationshipId = "relationship:adversarial", objectId = "object:adv", parentBlockHash = blockNumber === 10n ? "h9" : "h10", eventIndex = 0, chainId = 11155111, sourceDomain = "ethereum-sepolia", adapterVersion = "adv", payloadSchemaVersion = "slice-b-observation-v1", payload = { amount: "1" } } = {}) => {
  const source = { ...identity(transactionHash, eventIndex), domain: sourceDomain };
  return { observationId: observationId(source, "CapitalCommitted"), sourceEventId: sourceEventId(source), relationshipId, objectId, objectType: "Commitment", eventType: "CapitalCommitted", sourceDomain, chainKey: 1, chainId, contractAddress: "0xadv", transactionHash, eventIndex, blockNumber, blockHash, parentBlockHash, observedAt: 1, normalizedPayload: payload, payloadSchemaVersion, observationState: "OBSERVED", finalityState: "UNKNOWN", evidenceId: null, creditcoinReference: null, projectionReference: null, reconciliationReference: null, evidenceMode: "implemented_local", adapterVersion, createdAt: 1, updatedAt: 1 };
};
const run = (name, fn) => {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; }
};

run("complete two-block replay reaches CURRENT", () => {
  let state = createSliceBState();
  const old10 = observation({ blockNumber: 10n, blockHash: "h10", transactionHash: "0xold10" });
  const old11 = observation({ blockNumber: 11n, blockHash: "h11", transactionHash: "0xold11", parentBlockHash: "h10", eventIndex: 1 });
  state = advanceFinality(ingestObservation(state, old10), 1, 10n, 2);
  state = advanceFinality(ingestObservation(state, old11), 1, 11n, 3);
  const r10 = observation({ blockNumber: 10n, blockHash: "r10", transactionHash: "0xr10" });
  const r11 = observation({ blockNumber: 11n, blockHash: "r11", transactionHash: "0xr11", parentBlockHash: "r10", eventIndex: 1 });
  state = advanceFinality(ingestObservation(ingestObservation(state, r10), r11), 1, 11n, 4);
  const first = replayReorg(state, state.observations.get(r10.observationId), { finalizedBlock: 11n, observedAt: 5 });
  const second = replayReorg(first.state, first.state.observations.get(r11.observationId), { finalizedBlock: 11n, observedAt: 6 });
  assert.equal(second.outcome, "REPLAYED"); assert.equal(second.state.checkpoints.get(1).replayStatus, "CURRENT"); assert.equal(second.state.checkpoints.get(1).lastObservedBlockHash, "r11");
});

run("incomplete replay exposes recovery action", () => {
  let state = createSliceBState();
  const old10 = observation({ blockNumber: 10n, blockHash: "h10", transactionHash: "0xold10-incomplete" });
  const old11 = observation({ blockNumber: 11n, blockHash: "h11", transactionHash: "0xold11-incomplete", parentBlockHash: "h10", eventIndex: 1 });
  state = advanceFinality(ingestObservation(state, old10), 1, 10n, 2);
  state = advanceFinality(ingestObservation(state, old11), 1, 11n, 3);
  const replacement = observation({ blockNumber: 10n, blockHash: "r10", transactionHash: "0xr10-incomplete" });
  state = advanceFinality(ingestObservation(state, replacement), 1, 11n, 4);
  const result = replayReorg(state, state.observations.get(replacement.observationId), { finalizedBlock: 11n, observedAt: 5 });
  assert.equal(result.state.checkpoints.get(1).replayStatus, "REPLAY_REQUIRED"); assert.equal(result.state.checkpoints.get(1).replayFromBlock, 11n); assert.match(result.state.checkpoints.get(1).replayNextAction, /replacement/);
});

run("finality never selects a competing candidate", () => {
  let state = advanceFinality(ingestObservation(createSliceBState(), observation({ transactionHash: "0xbase" })), 1, 10n, 2);
  const candidateA = observation({ blockHash: "r10a", transactionHash: "0xa", objectId: "object:a" });
  const candidateB = observation({ blockHash: "r10b", transactionHash: "0xb", objectId: "object:b" });
  state = advanceFinality(ingestObservation(ingestObservation(state, candidateA), candidateB), 1, 10n, 3);
  assert.equal([...state.blockHistory.values()].filter((header) => header.blockNumber === 10n && header.status === "CANONICAL").length, 1);
  assert.equal([...state.blockHistory.values()].filter((header) => header.status === "CANDIDATE").length, 2);
});

run("metadata drift and nonfinite input are rejected", () => {
  let state = advanceFinality(ingestObservation(createSliceBState(), observation()), 1, 10n, 2);
  state = ingestObservation(state, { ...observation({ blockNumber: 11n, blockHash: "h11", transactionHash: "0xdrift" }), chainId: 999 });
  state = ingestObservation(state, { ...observation({ blockNumber: 12n, blockHash: "h12", transactionHash: "0xnan" }), observedAt: Number.NaN });
  assert.equal(state.observations.size, 1); assert.equal(state.deadLetters.length, 2);
});

run("conflicting observations cannot finalize", () => {
  const original = observation();
  let state = advanceFinality(ingestObservation(createSliceBState(), original), 1, 10n, 2);
  state = advanceFinality(ingestObservation(state, { ...original, blockHash: "h10-conflict", objectId: "object:conflict", normalizedPayload: { amount: "changed" } }), 1, 10n, 3);
  assert.notEqual(state.observations.get(original.observationId).finalityState, "FINALIZED"); assert.equal(buildRelationshipGraph(state, original.relationshipId).nodes.find((node) => node.id === original.objectId).validity, "HISTORICAL_REORGED");
});

run("evidence-first and observation-first linkage converge", () => {
  const item = observation({ transactionHash: "0xevidence" });
  const evidence = { evidenceId: "evidence:adv", relationshipId: item.relationshipId, sourceEventId: item.sourceEventId, mode: "implemented_local", sourceDomain: item.sourceDomain, chainKey: item.chainKey, chainId: item.chainId, transactionHash: item.transactionHash, eventIndex: item.eventIndex, blockNumber: item.blockNumber, blockHash: item.blockHash, attestcoinReference: "attest:adv", status: "ACCEPTED", linkedCreditcoinTransition: null, sourceReference: "adversarial", reason: null };
  const first = ingestObservation(recordEvidence(createSliceBState(), evidence), item);
  const second = recordEvidence(ingestObservation(createSliceBState(), item), evidence);
  assert.equal(first.observations.get(item.observationId).evidenceId, evidence.evidenceId); assert.equal(snapshotHash(first), snapshotHash(second));
});

run("reconciliation chronology survives restore", () => {
  const input = { relationshipId: "relationship:chronology-adv", sourceEventId: "source:chronology-adv", canonicalObjectId: "object:chronology-adv", observationAmount: "1", canonicalAmount: "1", authority: "projection", nextAction: "inspect", recoveryRole: "operator", reason: "fixture" };
  let state = reconcile(createSliceBState(), { ...input, state: "PENDING" }); state = reconcile(state, { ...input, state: "MISMATCH", reason: "mismatch" }); state = reconcile(state, { ...input, state: "PENDING", reason: "retry" });
  assert.deepEqual(restoreSnapshot(snapshot(state)).reconciliationHistory.map((item) => item.state), ["PENDING", "MISMATCH", "PENDING"]);
});

run("forged replay cannot return NOOP", () => {
  let state = advanceFinality(ingestObservation(createSliceBState(), observation()), 1, 10n, 2);
  const replacement = observation({ blockHash: "r10", transactionHash: "0xreplay-forged" });
  state = advanceFinality(ingestObservation(state, replacement), 1, 10n, 3);
  const replayed = replayReorg(state, state.observations.get(replacement.observationId), { finalizedBlock: 10n, observedAt: 4 });
  assert.equal(replayReorg(replayed.state, { ...replacement, objectId: "object:forged" }, { finalizedBlock: 10n, observedAt: 5 }).outcome, "BLOCKED"); assert.equal(replayReorg(replayed.state, replayed.state.observations.get(replacement.observationId), { finalizedBlock: 10n, observedAt: 5 }).outcome, "NOOP");
});

run("graph reads are fresh after mutation", () => {
  const first = observation({ transactionHash: "0xgraph", objectId: "object:first" });
  let state = projectRelationship(ingestObservation(createSliceBState(), first), first.relationshipId);
  const second = observation({ blockNumber: 11n, blockHash: "h11", parentBlockHash: "h10", transactionHash: "0xgraph-two", objectId: "object:second", eventIndex: 1 });
  state = advanceFinality(ingestObservation(state, second), 1, 11n, 2);
  assert.equal(buildRelationshipGraph(state, first.relationshipId).nodes.some((node) => node.id === second.objectId), true);
});

run("malformed snapshots are rejected", () => {
  const parsed = JSON.parse(snapshot(ingestObservation(createSliceBState(), observation())));
  parsed.observations[0][1].blockNumber = "bad";
  assert.throws(() => restoreSnapshot(JSON.stringify(parsed)), /INVALID_SNAPSHOT_BIGINT/);
});

if (process.exitCode) process.exit(process.exitCode);
