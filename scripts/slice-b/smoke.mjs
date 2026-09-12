import { spawn } from "node:child_process";
import { request } from "node:http";

const port = 4182;
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["--import", "tsx", "scripts/slice-b/server.ts"], { env: { ...process.env, SLICE_B_PORT: String(port) }, stdio: "ignore" });

function get(path, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = request(`${base}${path}`, { method }, (res) => {
      let body = "";
      res.setEncoding("utf8"); res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => { try { resolve({ status: res.statusCode, body: JSON.parse(body) }); } catch (error) { reject(error); } });
    });
    req.on("error", reject); req.end();
  });
}

function expect(condition, message) { if (!condition) throw new Error(message); }

try {
  let ready = false;
  for (let attempt = 0; attempt < 50 && !ready; attempt += 1) {
    try { ready = (await get("/health")).status === 200; } catch { await new Promise((resolve) => setTimeout(resolve, 50)); }
  }
  expect(ready, "API did not become ready");
  const health = await get("/health"); expect(health.body.readOnly === true, "health must be read-only");
  const relationship = await get("/relationships/relationship:slice-b:fixture"); expect(relationship.status === 200 && relationship.body.canonical === false, "relationship projection boundary missing");
  const evidence = await get("/evidence/evidence:slice-b-settlement"); expect(evidence.status === 200 && evidence.body.status === "ACCEPTED", "known evidence was not returned");
  const unknownEvidence = await get("/evidence/evidence:missing"); expect(unknownEvidence.status === 404 && unknownEvidence.body.error === "NOT_INDEXED", "unknown evidence must be typed 404");
  const traversal = await get("/evidence/%2e%2e%2fpackage.json"); expect(traversal.status === 404, "path traversal must not resolve");
  const malformedEncoding = await get("/evidence/%E0%A4%A"); expect(malformedEncoding.status === 404, "malformed path encoding must not crash the API");
  const settlement = await get("/settlements/settlement:slice-b-1"); expect(settlement.status === 409 && settlement.body.error === "AMBIGUOUS_OBJECT_SCOPE", "unscoped object ambiguity must be explicit");
  const scopedSettlement = await get("/settlements/settlement:slice-b-1?relationshipId=relationship:slice-b:fixture"); expect(scopedSettlement.status === 200 && scopedSettlement.body.relationshipId === "relationship:slice-b:fixture" && !Object.prototype.hasOwnProperty.call(scopedSettlement.body, "evidence"), "scoped object leaked unrelated evidence");
  const graph = await get("/relationships/relationship:slice-b:fixture/graph"); expect(graph.status === 200 && graph.body.schemaVersion === "slice-b-graph-v1", "graph route failed");
  const snapshot = await get("/snapshots/relationship:slice-b:fixture"); expect(snapshot.status === 200 && typeof snapshot.body.hash === "string", "snapshot route failed");
  const checkpoints = await get("/checkpoints"); expect(checkpoints.status === 200 && Array.isArray(checkpoints.body) && checkpoints.body.length >= 1, "checkpoint route must expose current state"); expect(checkpoints.body[0].chainKey === 1 && checkpoints.body[0].chainId === 11155111 && checkpoints.body[0].sourceDomain === "ethereum-sepolia" && checkpoints.body[0].cursorMode === "SPARSE_EVENT" && checkpoints.body[0].replayStatus === "CURRENT" && checkpoints.body[0].lastObservedBlock === "10n" && checkpoints.body[0].lastObservedBlockHash === "slice-b-block-10" && checkpoints.body[0].adapterVersion === "slice-b-server-v1" && checkpoints.body[0].observationSchemaVersion === "slice-b-observation-v1" && checkpoints.body[0].projectionSchemaVersion === "slice-b-read-model-v1", "checkpoint fields are incomplete");
  const investigations = await get("/investigations?relationshipId=relationship:slice-b:fixture"); expect(investigations.status === 200 && Array.isArray(investigations.body), "scoped investigations route failed");
  const exceptions = await get("/reconciliation/exceptions?relationshipId=relationship:slice-b:fixture"); expect(exceptions.status === 200 && Array.isArray(exceptions.body), "scoped reconciliation exceptions route failed");
  const write = await get("/health", "POST"); expect(write.status === 405 && write.body.error === "READ_ONLY", "write boundary failed");
  console.log("Slice B API smoke: PASS");
} finally {
  child.kill("SIGTERM");
}
