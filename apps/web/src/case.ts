export type Role = "provider" | "sponsor" | "operator";
export type EvidenceMode = "live_testnet" | "fixture_from_live_evidence" | "composite_fixture" | "implemented_local";
export type EvidenceLevel = "VERIFIED_CLEARA" | "TESTED_TESTNET" | "IMPLEMENTED_LOCAL";
export type CaseState =
  | "OBSERVED"
  | "FINALIZED"
  | "PENDING_SOURCE"
  | "PENDING_PROOF"
  | "PROVEN"
  | "CANONICAL"
  | "RECONCILED"
  | "MISMATCH"
  | "STALE"
  | "REORG_DETECTED"
  | "ROUTED"
  | "SETTLEMENT_PENDING"
  | "SETTLED"
  | "ACTIVE"
  | "COMMITTED"
  | "CONSUMED"
  | "EXPIRED"
  | "CANCELLED"
  | "REJECTED";

export type EvidenceKind = "testnet" | "composite_fixture" | "fixture";

export interface EvidenceRef {
  label: string;
  kind: EvidenceKind;
  status: CaseState;
  source: string;
  detail: string;
  tx?: string;
  artifact?: string;
  evidenceId?: string;
}

export interface CaseStage {
  id: string;
  label: string;
  state: CaseState;
  domain: "source" | "attestcoin" | "coordination" | "settlement" | "read-model";
  amount?: string;
  detail: string;
  evidence: EvidenceRef[];
}

export interface Capability {
  name: string;
  domain: string;
  status: "CANONICAL" | "EXECUTION" | "READABLE" | "UNSUPPORTED" | "LOCAL";
  detail: string;
}

export interface InvestigationItem {
  id: string;
  title: string;
  state: Extract<CaseState, "PENDING_SOURCE" | "PENDING_PROOF" | "MISMATCH" | "STALE" | "REORG_DETECTED">;
  reason: string;
  authority: string;
  blocked: string;
  recoveryRole: string;
  nextAction: string;
}

export interface SettlementReceipt {
  sourceTxHash: string;
  sourceReceiptStatus: 1;
  token: string;
  debtor: string;
  creditor: string;
  amount: "340000";
  attestationEvidenceId: string;
  attestationAccepted: true;
  evidenceConsumed: true;
  reconciled: true;
}

export interface CaseGraph {
  id: string;
  label: string;
  environment: "testnet";
  continuity: "composite_fixture";
  disclaimer: string;
  settlementReceipt: Readonly<SettlementReceipt>;
  stages: CaseStage[];
  investigations: InvestigationItem[];
  capabilities: Capability[];
}

const evidence = {
  m3: {
    label: "M3 claim ingestion",
    kind: "testnet" as const,
    status: "PROVEN" as const,
    source: "GitHub Actions run 33253029696",
    artifact: "9715192463",
    detail: "Sepolia claim inclusion was proven and accepted on CC3.",
  },
  m4: {
    label: "M4 financeability",
    kind: "testnet" as const,
    status: "CANONICAL" as const,
    source: "GitHub Actions run 33254529904",
    artifact: "9715412301",
    detail: "Financeable capacity and bounded encumbrance were proven.",
  },
  m5: {
    label: "M5 facility/allocation",
    kind: "testnet" as const,
    status: "CANONICAL" as const,
    source: "GitHub Actions run 33256911456",
    artifact: "9716144997",
    detail: "Facility and provider allocation semantics were proven.",
  },
  m8: {
    label: "M8 obligations",
    kind: "testnet" as const,
    status: "FINALIZED" as const,
    source: "GitHub Actions run 33280253700",
    artifact: "9722789518",
    detail: "Finalized obligations were created from the evidenced facility state.",
  },
  m6: {
    label: "M6 source commitment",
    kind: "testnet" as const,
    status: "PROVEN" as const,
    source: "GitHub Actions run 33261468561",
    artifact: "9717582867",
    detail: "Source capital lock and active commitment evidence are shown separately from later lifecycle terminal accounting.",
  },
  m7: {
    label: "M7 capitalization",
    kind: "testnet" as const,
    status: "CANONICAL" as const,
    source: "GitHub Actions run 33274674575",
    artifact: "9721384433",
    detail: "Three-provider capitalization composition was sealed on CC3.",
  },
  m9: {
    label: "M9 bilateral clearing",
    kind: "testnet" as const,
    status: "FINALIZED" as const,
    source: "GitHub Actions run 33280768286",
    artifact: "9722957475",
    detail: "Explicitly authorized bilateral clearing was finalized.",
  },
  m10: {
    label: "M10 residual routing",
    kind: "testnet" as const,
    status: "ROUTED" as const,
    source: "GitHub Actions run 33311029527",
    artifact: "9731999552",
    detail: "Clearing derived a 340,000 residual and recorded a route. Routing was not settlement.",
  },
  m11: {
    label: "M11 settlement",
    kind: "testnet" as const,
    status: "SETTLED" as const,
    source: "GitHub Actions run 33614782209",
    artifact: "9841386218",
    tx: "0x05a33c79f20c303ceda96fd10353a9bfb9197c24328457b07872f0580e39d6ce",
    evidenceId: "0xcff0e27032bb8461dc3cd76b7a31730b3bd9b6ec2eb2aead97e88b1c274126ad",
    detail: "Source settlement was payer-validated, Attestcoin-proven, and reconciled on CC3.",
  },
  lifecycle: {
    label: "M11-Lifecycle",
    kind: "testnet" as const,
    status: "CONSUMED" as const,
    source: "GitHub Actions run 33699324988",
    artifact: "9873864767",
    detail: "CapitalConsumed and CapitalExpired were independently proven and synchronized.",
  },
};

const ref = (base: EvidenceRef, detail?: string): EvidenceRef => ({ ...base, ...(detail ? { detail } : {}) });

const CANONICAL_M11_RECEIPT: Readonly<SettlementReceipt> = Object.freeze({
  sourceTxHash: "0x05a33c79f20c303ceda96fd10353a9bfb9197c24328457b07872f0580e39d6ce",
  sourceReceiptStatus: 1,
  token: "0x2a7eB085e4Ef74d089b8fBaA0d768C28d31DF821",
  debtor: "0x5ac98dc6f8408564645f36195aC0F9c5B1c0C0C8",
  creditor: "0x8766760e375bD43f600D23C40aDCeeDD62a60e2b",
  amount: "340000",
  attestationEvidenceId: "0xcff0e27032bb8461dc3cd76b7a31730b3bd9b6ec2eb2aead97e88b1c274126ad",
  attestationAccepted: true,
  evidenceConsumed: true,
  reconciled: true,
});

export function seedCase(): CaseGraph {
  return {
    id: "case:composite:m3-m11-lifecycle",
    label: "Northstar facility relationship",
    environment: "testnet",
    continuity: "composite_fixture",
    disclaimer: "Composite fixture: stages combine separately evidenced testnet runs. This is not one uninterrupted M3→M11 deployment lifecycle.",
    settlementReceipt: CANONICAL_M11_RECEIPT,
    stages: [
      { id: "claim", label: "Claim", state: "PROVEN", domain: "source", amount: "1,000,000", detail: "Verified claim fixture; claim evidence is separate from financial authorization.", evidence: [ref(evidence.m3)] },
      { id: "capacity", label: "Financeable capacity", state: "CANONICAL", domain: "coordination", amount: "1,000,000", detail: "Capacity is bounded by face value and active encumbrance.", evidence: [ref(evidence.m4)] },
      { id: "encumbrance", label: "Encumbrance", state: "CANONICAL", domain: "coordination", amount: "1,000,000", detail: "Encumbrance reserves capacity; it is not a capital commitment.", evidence: [ref(evidence.m5)] },
      { id: "facility", label: "Facility", state: "ACTIVE", domain: "coordination", amount: "1,000,000", detail: "Facility state is canonical on Creditcoin CC3; it is the authority for facility accounting.", evidence: [ref(evidence.m7)] },
      { id: "allocations", label: "Provider allocations", state: "COMMITTED", domain: "coordination", amount: "1,000,000", detail: "Allocations are committed against the facility; they are distinct from source capital commitment.", evidence: [ref(evidence.m7)] },
      { id: "commitments", label: "Provider commitments", state: "ACTIVE", domain: "source", amount: "1,000,000", detail: "Source CapitalCommitted is proven and the Creditcoin commitment is ACTIVE; later consumed/expired terminal accounting is shown separately.", evidence: [ref(evidence.m6), ref(evidence.m7)] },
      { id: "capitalization", label: "Capitalization", state: "CANONICAL", domain: "coordination", amount: "1,000,000", detail: "Immutable capitalization composition was sealed on CC3.", evidence: [ref(evidence.m7)] },
      { id: "obligations", label: "Obligations", state: "FINALIZED", domain: "coordination", amount: "460,000", detail: "Finalized obligations are not payment instructions and are not yet settlement.", evidence: [ref(evidence.m8)] },
      { id: "clearing", label: "Bilateral clearing", state: "FINALIZED", domain: "coordination", amount: "60,000", detail: "Explicit authorization reduced gross movement; clearing is not settlement.", evidence: [ref(evidence.m9)] },
      { id: "residual", label: "Economic residual", state: "ROUTED", domain: "coordination", amount: "340,000", detail: "Residual is derived from obligation accounting; it is not a settlement receipt.", evidence: [ref(evidence.m10)] },
      { id: "route", label: "Settlement route", state: "ROUTED", domain: "settlement", amount: "340,000", detail: "Route instruction exists; settledAmount remains unchanged until proof and reconciliation.", evidence: [ref(evidence.m10)] },
      { id: "native-settlement", label: "Native settlement", state: "SETTLED", domain: "source", amount: "340,000", detail: "Exact ERC20 payer, recipient, token, amount, and successful receipt were validated.", evidence: [ref(evidence.m11)] },
      { id: "attestcoin", label: "Attestcoin evidence", state: "PROVEN", domain: "attestcoin", amount: "340,000", detail: "Attestcoin proves inclusion and continuity; it does not authorize financial meaning.", evidence: [ref(evidence.m11)] },
      { id: "reconciliation", label: "Creditcoin reconciliation", state: "RECONCILED", domain: "coordination", amount: "340,000", detail: "Residual and obligation state agree after evidence consumption.", evidence: [ref(evidence.m11)] },
      { id: "terminal", label: "Terminal lifecycle", state: "CONSUMED", domain: "coordination", amount: "100,000 consumed / 100,000 expired", detail: "Lifecycle terminal states are shown with separate consume and expire evidence.", evidence: [ref(evidence.lifecycle)] },
    ],
    investigations: [
      { id: "pending-source", title: "Source receipt awaiting finality", state: "PENDING_SOURCE", reason: "The source event was observed but its block has not met the configured finality policy.", authority: "Source chain finality", blocked: "Proof request and downstream coordination are blocked.", recoveryRole: "Operator / source observer", nextAction: "Wait for finality, then re-read the source receipt." },
      { id: "pending-proof", title: "Provider commitment awaiting proof", state: "PENDING_PROOF", reason: "Source CapitalCommitted is observed, but Attestcoin evidence has not been accepted yet.", authority: "Attestcoin proof gate", blocked: "Creditcoin commitment cannot be treated as proven.", recoveryRole: "Operator / proof worker", nextAction: "Wait for source finality, then request proof." },
      { id: "mismatch", title: "Coordination amount mismatch", state: "MISMATCH", reason: "Observed source amount does not agree with the Creditcoin commitment amount.", authority: "Creditcoin canonical state plus source receipt", blocked: "Downstream financial action is paused.", recoveryRole: "Operator / reconciliation owner", nextAction: "Pause downstream action and reconcile the source and coordination records." },
      { id: "stale", title: "Projection checkpoint is stale", state: "STALE", reason: "The local read model has not observed a newer authoritative checkpoint within its freshness window.", authority: "Creditcoin canonical state", blocked: "The workbench cannot assert current state from a stale projection.", recoveryRole: "Indexer operator", nextAction: "Refresh from the last trusted checkpoint before presenting current state." },
      { id: "reorg", title: "Source block reorg detected", state: "REORG_DETECTED", reason: "The observed block hash changed before the projection was finalized.", authority: "Source-chain canonical head", blocked: "The affected projection lane is halted.", recoveryRole: "Operator / indexer", nextAction: "Halt the affected projection lane and replay from the last final checkpoint." },
    ],
    capabilities: [
      { name: "Canonical coordination", domain: "Creditcoin CC3", status: "CANONICAL", detail: "Financial and coordination state lives on CC3." },
      { name: "Source execution", domain: "Ethereum Sepolia", status: "EXECUTION", detail: "Native source actions and testnet settlement execute on Sepolia." },
      { name: "Attestcoin readability", domain: "Sepolia / chainKey 1", status: "READABLE", detail: "Source inclusion and continuity can be proven through Attestcoin." },
      { name: "Settlement execution", domain: "Ethereum Sepolia", status: "EXECUTION", detail: "M11 testnet mock-token settlement path is evidenced; no production rail claim." },
      { name: "Ethereum Mainnet", domain: "chainKey 3", status: "READABLE", detail: "Supported readability substrate; no Cleara settlement evidence claim." },
      { name: "Base / Arbitrum / BNB", domain: "Not configured", status: "UNSUPPORTED", detail: "Not enabled or verified in the current slice." },
      { name: "Read-model projection", domain: "Local only", status: "LOCAL", detail: "Deterministic projection core; no production indexer or API claim." },
    ],
  };
}

export function isRole(value: unknown): value is Role {
  return value === "provider" || value === "sponsor" || value === "operator";
}

export function roleSummary(role: Role, graph: CaseGraph): { caseId: string; title: string; question: string; focus: string[] } {
  if (!isRole(role)) throw new Error("unsupported role");
  const summaries: Record<Role, { title: string; question: string; focus: string[] }> = {
    provider: { title: "Capital provider", question: "Is my capital still active, proven, and correctly reflected?", focus: ["commitments", "capitalization", "terminal"] },
    sponsor: { title: "Facility sponsor / debtor", question: "What remains to settle, and has the residual actually reconciled?", focus: ["facility", "obligations", "clearing", "residual", "native-settlement", "reconciliation"] },
    operator: { title: "Operator / auditor", question: "Can I trace every state change to evidence and identify what needs attention?", focus: ["claim", "attestcoin", "commitments", "route", "reconciliation", "terminal"] },
  };
  return { caseId: graph.id, ...summaries[role] };
}

function exactDataRecord(value: unknown, expected: Readonly<Record<string, unknown>>): boolean {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Reflect.ownKeys(value);
  const expectedKeys = Object.keys(expected);
  if (keys.some((key) => typeof key !== "string") || keys.length !== expectedKeys.length || keys.some((key) => !expectedKeys.includes(key as string))) return false;
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || descriptor.value !== expected[key]) return false;
  }
  return true;
}

function ownData(value: unknown, key: string): unknown {
  if (value === null || typeof value !== "object") return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function validateStage(stage: unknown): CaseStage | null {
  if (stage === null || typeof stage !== "object" || Object.getPrototypeOf(stage) !== Object.prototype) return null;
  const id = ownData(stage, "id");
  const label = ownData(stage, "label");
  const state = ownData(stage, "state");
  const domain = ownData(stage, "domain");
  const amount = ownData(stage, "amount");
  const detail = ownData(stage, "detail");
  const evidence = ownData(stage, "evidence");
  if (typeof id !== "string" || typeof label !== "string" || typeof state !== "string" || typeof domain !== "string" || typeof amount !== "string" || typeof detail !== "string" || !Array.isArray(evidence)) return null;
  return stage as CaseStage;
}

function settlementBadgeInternal(graph: CaseGraph): CaseState {
  if (graph === null || typeof graph !== "object" || Object.getPrototypeOf(graph) !== Object.prototype) return "REJECTED";
  const rawStages = ownData(graph, "stages");
  const rawReceipt = ownData(graph, "settlementReceipt");
  if (!Array.isArray(rawStages) || rawReceipt === undefined) return "REJECTED";
  const stages = rawStages.map(validateStage);
  if (stages.some((stage): stage is null => stage === null)) return "REJECTED";
  const validStages = stages as CaseStage[];
  const ids = validStages.map((stage) => stage.id);
  if (new Set(ids).size !== ids.length) return "REJECTED";
  const get = (id: string): CaseStage | undefined => validStages.find((stage) => stage.id === id);
  const route = get("route");
  const settlement = get("native-settlement");
  const proof = get("attestcoin");
  const reconciliation = get("reconciliation");
  const shape = [
    [route, "Settlement route", "settlement"],
    [settlement, "Native settlement", "source"],
    [proof, "Attestcoin evidence", "attestcoin"],
    [reconciliation, "Creditcoin reconciliation", "coordination"],
  ] as const;
  if (shape.some(([stage, label, domain]) => stage === undefined || stage.label !== label || stage.domain !== domain)) return "REJECTED";
  const expectedAmount = "340,000";
  const required = [route, settlement, proof, reconciliation];
  const complete = required.every((stage) => stage !== undefined && stage.evidence.length > 0);
  const evidenceMatches = (stage: CaseStage | undefined, expected: EvidenceRef): boolean =>
    stage?.evidence.length === 1 && exactDataRecord(stage.evidence[0], expected as unknown as Readonly<Record<string, unknown>>);
  const expectedRouteEvidence = evidence.m10;
  const expectedSettlementEvidence = evidence.m11;
  const amountsAgree = required.every((stage) => stage?.amount === expectedAmount);
  const evidenceAgrees = evidenceMatches(route, expectedRouteEvidence) &&
    evidenceMatches(settlement, expectedSettlementEvidence) &&
    evidenceMatches(proof, expectedSettlementEvidence) &&
    evidenceMatches(reconciliation, expectedSettlementEvidence);
  const receipt = rawReceipt;
  const receiptAgrees = exactDataRecord(receipt, CANONICAL_M11_RECEIPT as unknown as Readonly<Record<string, unknown>>);
  if (route?.state !== "ROUTED" || settlement?.state !== "SETTLED" || proof?.state !== "PROVEN" || reconciliation?.state !== "RECONCILED" || !complete || !amountsAgree || !evidenceAgrees || !receiptAgrees) {
    return route?.state === "ROUTED" ? "SETTLEMENT_PENDING" : "REJECTED";
  }
  return "SETTLED";
}

export function settlementBadge(graph: CaseGraph): CaseState {
  try {
    return settlementBadgeInternal(graph);
  } catch {
    return "REJECTED";
  }
}

export function hasPersonalData(value: unknown): boolean {
  const forbiddenKey = /private[_-]?key|secret|password|seed|mnemonic|email|phone|full[_-]?name|user[_-]?id|wallet|account|person|api[_-]?key|credential|auth[_-]?(?:token|key|secret|credential|header)|bearer|secret[_-]?key/i;
  const forbiddenValue = /-----BEGIN [A-Z ]+PRIVATE KEY-----|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
  const seen = new WeakSet<object>();
  const visit = (current: unknown): boolean => {
    if (typeof current === "string") return forbiddenValue.test(current);
    if (current === null || typeof current !== "object") return false;
    if (seen.has(current)) return false;
    seen.add(current);
    for (const key of Reflect.ownKeys(current)) {
      const label = typeof key === "symbol" ? String(key) : key;
      if (forbiddenKey.test(label)) return true;
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (descriptor && !("value" in descriptor)) return true;
      if (descriptor && "value" in descriptor && visit(descriptor.value)) return true;
    }
    if (current instanceof Map) return [...Map.prototype.entries.call(current)].some(([key, child]) =>
      (typeof key === "string" && forbiddenKey.test(key)) || visit(key) || visit(child));
    if (current instanceof Set) return [...Set.prototype.values.call(current)].some(visit);
    const prototype = Object.getPrototypeOf(current);
    return prototype !== null && prototype !== Object.prototype ? visit(prototype) : false;
  };
  try {
    return visit(value);
  } catch {
    return true;
  }
}
