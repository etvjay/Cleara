import assert from "node:assert/strict";
import test from "node:test";
import { createSliceBApi } from "../src/api.js";
import {
  advanceFinality,
  createSliceBState,
  ingestObservation,
  observationId,
  reconcile,
  restoreSnapshot,
  snapshot,
  sourceEventId,
  type ObservationEnvelope,
} from "../src/slice-b.js";

const relationshipId = "relationship:contract";
const source = { domain: "ethereum-sepolia", chainKey: 1, transactionHash: "0xcontract", eventIndex: 0 } as const;
const observation: ObservationEnvelope = {
  observationId: observationId(source, "CapitalCommitted"),
  sourceEventId: sourceEventId(source),
  relationshipId,
  objectId: "commitment:contract",
  objectType: "Commitment",
  eventType: "CapitalCommitted",
  sourceDomain: source.domain,
  chainKey: source.chainKey,
  chainId: 11155111,
  contractAddress: "0xcontract-source",
  transactionHash: source.transactionHash,
  eventIndex: source.eventIndex,
  blockNumber: 10n,
  blockHash: "contract-h10",
  parentBlockHash: "contract-h9",
  observedAt: 1,
  normalizedPayload: { amount: "1" },
  payloadSchemaVersion: "slice-b-observation-v1",
  observationState: "OBSERVED",
  finalityState: "UNKNOWN",
  evidenceId: null,
  creditcoinReference: null,
  projectionReference: null,
  reconciliationReference: null,
  evidenceMode: "implemented_local",
  adapterVersion: "contract-v1",
  createdAt: 1,
  updatedAt: 1,
};

test("Slice B public contract exposes only serialized read-only surfaces", () => {
  let state = ingestObservation(createSliceBState([{ chainKey: 1, chainId: 11155111, sourceDomain: "ethereum-sepolia", adapterVersion: "contract-v1", observationSchemaVersion: "slice-b-observation-v1", finalityPolicyVersion: "contract-finality-v1", cursorMode: "SPARSE_EVENT", anchorBlockNumber: 9n, anchorBlockHash: "contract-h9" }]), observation);
  state = advanceFinality(state, 1, 10n, 2);
  state = reconcile(state, {
    relationshipId,
    sourceEventId: observation.sourceEventId,
    canonicalObjectId: observation.objectId,
    state: "PENDING",
    observationAmount: "1",
    canonicalAmount: null,
    authority: "projection",
    nextAction: "inspect",
    recoveryRole: "operator",
    reason: "fixture",
  });

  const api = createSliceBApi(state);
  const checkpoint = api.checkpoint(1);
  const relationship = api.relationship(relationshipId);
  const timeline = api.timeline(relationshipId);
  const graph = api.graph(relationshipId);
  const evidence = api.evidence("missing", relationshipId);
  const investigations = api.investigations(relationshipId);
  const reconciliation = api.reconciliation(relationshipId);
  const serialized = api.serializeSnapshot();

  assert.equal(checkpoint?.chainKey, 1);
  assert.equal((relationship as { relationshipId: string }).relationshipId, relationshipId);
  assert.equal(timeline.length, 1);
  assert.equal((graph as { scope: string }).scope, "relationship_projection");
  assert.equal(evidence, null);
  assert.ok(Array.isArray(investigations));
  assert.equal(reconciliation.current[0]?.state, "PENDING");
  assert.equal(reconciliation.history[0]?.state, "PENDING");
  assert.equal(typeof serialized.body, "string");
  assert.equal(typeof serialized.hash, "string");
  assert.equal(restoreSnapshot(serialized.body).schemaVersion, "slice-b-read-model-v1");

  assert.equal("observations" in api, false);
  assert.equal("evidence" in api && typeof (api as unknown as { evidence: unknown }).evidence !== "function", false);
  assert.equal(typeof snapshot(state), "string");
});
