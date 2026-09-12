import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createSliceBApi } from "../../workers/multichain-execution/src/api.js";
import { advanceFinality, createSliceBState, ingestObservation, observationId, projectRelationship, recordEvidence, sourceEventId, type ObservationEnvelope } from "../../workers/multichain-execution/src/slice-b.js";

const relationshipId = "relationship:slice-b:fixture";
const identity = { domain: "ethereum-sepolia", chainKey: 1, transactionHash: "0xsliceb0001", eventIndex: 0 } as const;
const observation: ObservationEnvelope = {
  observationId: observationId(identity, "SettlementExecuted"), sourceEventId: sourceEventId(identity), relationshipId, objectId: "settlement:slice-b-1", objectType: "Settlement", eventType: "SettlementExecuted", sourceDomain: "ethereum-sepolia", chainKey: 1, chainId: 11155111, contractAddress: "0xsettlement-adapter-fixture", transactionHash: identity.transactionHash, eventIndex: 0, blockNumber: 10n, blockHash: "slice-b-block-10", parentBlockHash: "slice-b-block-9", observedAt: 100, normalizedPayload: { amount: "340000", asset: "USD" }, payloadSchemaVersion: "slice-b-observation-v1", observationState: "OBSERVED", finalityState: "UNKNOWN", evidenceId: null, creditcoinReference: null, projectionReference: null, reconciliationReference: null, evidenceMode: "fixture_from_live_evidence", adapterVersion: "slice-b-server-v1", createdAt: 100, updatedAt: 100,
};
let state = ingestObservation(createSliceBState(), observation);
state = advanceFinality(state, 1, 10n, 101);
state = recordEvidence(state, { evidenceId: "evidence:slice-b-settlement", relationshipId, sourceEventId: observation.sourceEventId, mode: "fixture_from_live_evidence", sourceDomain: "ethereum-sepolia", chainKey: 1, transactionHash: identity.transactionHash, blockNumber: 10n, attestcoinReference: "attestcoin:fixture:m11", status: "ACCEPTED", linkedCreditcoinTransition: "cc3:reconciliation:fixture", sourceReference: "M11 settlement evidence", reason: null });
state = recordEvidence(state, { evidenceId: observation.objectId, relationshipId: "relationship:slice-b:other", sourceEventId: "source:slice-b:other", mode: "implemented_local", sourceDomain: "ethereum-sepolia", chainKey: 1, transactionHash: "0xother", blockNumber: 11n, attestcoinReference: "attestcoin:other", status: "ACCEPTED", linkedCreditcoinTransition: null, sourceReference: "unrelated same-ID evidence fixture", reason: null });
state = projectRelationship(state, relationshipId);
const api = createSliceBApi(state);
const json = (value: unknown): string => JSON.stringify(value, (_, current) => typeof current === "bigint" ? `${current}n` : current);
const safeDecode = (value: string): string | null => { try { return decodeURIComponent(value); } catch { return null; } };

const server = createServer((request: IncomingMessage, response: ServerResponse) => {
  response.setHeader("content-type", "application/json; charset=utf-8"); response.setHeader("cache-control", "no-store");
  const url = new URL(request.url ?? "/", "http://localhost"); let value: unknown;
  if (request.method !== "GET") { response.writeHead(405); response.end(json({ error: "READ_ONLY" })); return; }
  if (url.pathname === "/health") value = api.health();
  else if (url.pathname === `/relationships/${relationshipId}`) value = api.relationship(relationshipId);
  else if (url.pathname === `/relationships/${relationshipId}/timeline`) value = api.timeline(relationshipId);
  else if (url.pathname === `/relationships/${relationshipId}/graph`) value = api.graph(relationshipId);
  else if (/^\/evidence\/[^/]+$/.test(url.pathname)) { const evidenceId = safeDecode(url.pathname.slice("/evidence/".length)); if (evidenceId === null) { response.writeHead(404); response.end(json({ error: "NOT_INDEXED" })); return; } value = api.evidence(evidenceId); if (value === null) { response.writeHead(404); response.end(json({ error: "NOT_INDEXED", evidenceId })); return; } }
  else if (/^\/(facilities|commitments|obligations|settlements)\/[^/]+$/.test(url.pathname)) { const encodedObjectId = url.pathname.slice(url.pathname.indexOf("/") + 1).split("/")[1]!; const objectId = safeDecode(encodedObjectId); if (objectId === null) { response.writeHead(404); response.end(json({ error: "NOT_INDEXED" })); return; } value = api.object(objectId, url.searchParams.get("relationshipId") ?? undefined); if (value === null) { response.writeHead(404); response.end(json({ error: "NOT_INDEXED", objectId })); return; } if (typeof value === "object" && value !== null && "error" in value && (value as { error?: string }).error === "AMBIGUOUS_OBJECT_SCOPE") { response.writeHead(409); response.end(json(value)); return; } }
  else if (url.pathname === "/reconciliation/exceptions") value = api.investigations(url.searchParams.get("relationshipId") ?? undefined);
  else if (url.pathname === "/investigations") value = api.investigations(url.searchParams.get("relationshipId") ?? undefined);
  else if (url.pathname === "/checkpoints") value = api.checkpoints();
  else if (url.pathname === `/snapshots/${relationshipId}`) value = api.snapshot();
  else { response.writeHead(404); response.end(json({ error: "NOT_FOUND" })); return; }
  response.writeHead(200); response.end(json(value));
});

const port = Number(process.env.SLICE_B_PORT ?? 4180);
server.listen(port, "127.0.0.1", () => console.log(`Cleara Slice B local API at http://127.0.0.1:${port}`));
