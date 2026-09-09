import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { hasPersonalData, roleSummary, seedCase, settlementBadge, type Role } from "../src/case.js";

test("evidence manifest has explicit schema, modes, levels, and provenance fields", () => {
  const manifest = JSON.parse(readFileSync(resolve(process.cwd(), "../../docs/submission/evidence-manifest.json"), "utf8")) as {
    schemaVersion: string;
    caseContinuity: string;
    records: Array<Record<string, unknown>>;
  };
  const modes = new Set(["live_testnet", "fixture_from_live_evidence", "composite_fixture", "implemented_local"]);
  const levels = new Set(["VERIFIED_CLEARA", "TESTED_TESTNET", "IMPLEMENTED_LOCAL"]);
  assert.equal(manifest.schemaVersion, "1.0");
  assert.equal(manifest.caseContinuity, "COMPOSITE_FIXTURE");
  assert.ok(manifest.records.length >= 12);
  for (const record of manifest.records) {
    assert.ok(levels.has(String(record.evidenceLevel)));
    assert.ok(modes.has(String(record.evidenceMode)));
    for (const field of ["workflowRun", "artifact", "sourceChain", "evmChainId", "chainKey", "sourceTransaction", "sourceBlock", "finality", "attestcoinEvidenceId", "attestcoinQueryId", "creditcoinTransaction", "reconciliationStatus", "sourceDocument", "authority", "currentState", "sourceObservation", "proofStatus", "creditcoinStatus", "nextPermittedAction"]) {
      assert.ok(Object.hasOwn(record, field), `${field} missing from ${String(record.id)}`);
    }
  }
});

test("one shared case graph feeds all three role views", () => {
  const graph = seedCase();
  const roles: Role[] = ["provider", "sponsor", "operator"];
  const views = roles.map((role) => roleSummary(role, graph));
  assert.deepEqual(views.map((view) => view.caseId), [graph.id, graph.id, graph.id]);
  assert.deepEqual(views.map((view) => view.title), ["Capital provider", "Facility sponsor / debtor", "Operator / auditor"]);
  assert.ok(views.every((view) => view.focus.length > 0));
});

test("shared case preserves accounting invariant", () => {
  const graph = seedCase();
  const commitments = graph.stages.find((stage) => stage.id === "commitments");
  assert.equal(commitments?.amount, "1,000,000");
  const lifecycleAccounting = graph.stages.find((stage) => stage.id === "terminal")?.amount;
  assert.equal(lifecycleAccounting, "100,000 consumed / 100,000 expired");
});

test("settled requires proof and reconciliation, not routing alone", () => {
  const graph = seedCase();
  assert.equal(settlementBadge(graph), "SETTLED");
  const proof = graph.stages.find((stage) => stage.id === "attestcoin");
  assert.ok(proof);
  proof.state = "PENDING_PROOF";
  assert.equal(settlementBadge(graph), "SETTLEMENT_PENDING");
});

test("composite fixture is explicit and non-continuous", () => {
  const graph = seedCase();
  assert.equal(graph.continuity, "composite_fixture");
  assert.match(graph.disclaimer, /not one uninterrupted/i);
});

test("case exposes pending, mismatch, and reorg investigation work items", () => {
  const graph = seedCase();
  assert.deepEqual(graph.investigations.map((item) => item.state), ["PENDING_SOURCE", "PENDING_PROOF", "MISMATCH", "STALE", "REORG_DETECTED"]);
  assert.ok(graph.investigations.every((item) => item.authority.length > 0 && item.blocked.length > 0 && item.recoveryRole.length > 0 && item.nextAction.length > 0));
  assert.ok(graph.capabilities.some((capability) => capability.status === "UNSUPPORTED"));
});

test("settled fails closed for missing route, evidence, or amount agreement", () => {
  const missingRoute = seedCase();
  missingRoute.stages.find((stage) => stage.id === "route")!.state = "SETTLEMENT_PENDING";
  assert.equal(settlementBadge(missingRoute), "REJECTED");

  const missingEvidence = seedCase();
  missingEvidence.stages.find((stage) => stage.id === "reconciliation")!.evidence = [];
  assert.equal(settlementBadge(missingEvidence), "SETTLEMENT_PENDING");

  const mismatchedAmount = seedCase();
  mismatchedAmount.stages.find((stage) => stage.id === "route")!.amount = "339,999";
  assert.equal(settlementBadge(mismatchedAmount), "SETTLEMENT_PENDING");
});

test("settled rejects forged evidence, duplicate stages, and arbitrary equal amounts", () => {
  const forged = seedCase();
  for (const id of ["route", "native-settlement", "attestcoin", "reconciliation"]) {
    const stage = forged.stages.find((item) => item.id === id)!;
    stage.amount = "999";
    stage.evidence = [{ label: "M11 settlement", kind: "testnet", status: "SETTLED", source: "forged", artifact: "9841386218", detail: "forged" }];
  }
  assert.equal(settlementBadge(forged), "SETTLEMENT_PENDING");

  const duplicate = seedCase();
  duplicate.stages.push({ ...duplicate.stages.find((stage) => stage.id === "route")! });
  assert.equal(settlementBadge(duplicate), "REJECTED");

  const contradictoryEvidence = seedCase();
  contradictoryEvidence.stages.find((stage) => stage.id === "route")!.evidence.push({ ...contradictoryEvidence.stages.find((stage) => stage.id === "route")!.evidence[0]!, source: "forged" });
  assert.equal(settlementBadge(contradictoryEvidence), "SETTLEMENT_PENDING");

  const tamperedReceipt = seedCase();
  (tamperedReceipt as unknown as { settlementReceipt: object }).settlementReceipt = { ...tamperedReceipt.settlementReceipt, amount: "999" };
  assert.equal(settlementBadge(tamperedReceipt), "SETTLEMENT_PENDING");
});

test("role summary rejects invalid runtime roles", () => {
  assert.throws(() => roleSummary("intruder" as Role, seedCase()), /unsupported role/);
});

test("fixture scanner catches map, set, and credential variants", () => {
  const map = new Map([["apiKey", "redacted"]]);
  const set = new Set([{ credential: "redacted" }]);
  assert.equal(hasPersonalData(map), true);
  assert.equal(hasPersonalData(set), true);
  assert.equal(hasPersonalData({ authToken: "redacted" }), true);
});

test("fixture scanner rejects own properties on map and set containers", () => {
  const map = new Map();
  Object.defineProperty(map, "email", { value: "person@example.com" });
  const set = new Set();
  Object.defineProperty(set, "password", { value: "redacted" });
  assert.equal(hasPersonalData(map), true);
  assert.equal(hasPersonalData(set), true);
});

test("settlement rejects custom-prototype and inherited stage fields", () => {
  const graph = seedCase();
  const route = graph.stages.find((stage) => stage.id === "route")!;
  graph.stages[graph.stages.indexOf(route)] = Object.assign(Object.create({ label: "Settlement route" }), route);
  assert.equal(settlementBadge(graph), "REJECTED");
});

test("fixture scanner catches non-enumerable and symbol-keyed forbidden fields", () => {
  const graph = seedCase() as unknown as Record<PropertyKey, unknown>;
  Object.defineProperty(graph, "email", { value: "person@example.com", enumerable: false });
  assert.equal(hasPersonalData(graph), true);
  const symbol = Symbol("privateKey");
  const symbolGraph = seedCase() as unknown as Record<PropertyKey, unknown>;
  Object.defineProperty(symbolGraph, symbol, { value: "redacted", enumerable: false });
  assert.equal(hasPersonalData(symbolGraph), true);
});

test("fixture rejects explicit personal or credential fields", () => {
  const graph = seedCase();
  assert.equal(hasPersonalData({ ...graph, operatorEmail: "person@example.com" }), true);
  assert.equal(hasPersonalData({ ...graph, walletAddress: "0x1234" }), true);
});

test("fixture has no secrets or personal data", () => {
  assert.equal(hasPersonalData(seedCase()), false);
});
