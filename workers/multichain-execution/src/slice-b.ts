import { createHash } from "node:crypto";

export type EvidenceMode = "live_testnet" | "fixture_from_live_evidence" | "composite_fixture" | "implemented_local";
export type ObservationState = "OBSERVED" | "MALFORMED" | "DUPLICATE" | "CONFLICTING" | "UNAVAILABLE";
export type FinalityState = "UNKNOWN" | "FINALITY_PENDING" | "FINALIZED" | "REORGED";
export type EvidenceState = "NOT_REQUIRED" | "NOT_REQUESTED" | "PENDING" | "ACCEPTED" | "REJECTED" | "CONSUMED" | "STALE";
export type CanonicalState = "NOT_READ" | "READ" | "MATCHED" | "CONFLICTING" | "UNAVAILABLE";
export type ProjectionReadModelState = "NOT_INDEXED" | "INDEXED" | "STALE" | "REORGED" | "REPLAY_REQUIRED" | "REJECTED";
export type ReconciliationState = "UNKNOWN" | "PENDING" | "RECONCILED" | "MISMATCH" | "STALE" | "REORG_DETECTED" | "REJECTED";
export type OperationalState = "READY" | "BLOCKED" | "RETRYABLE" | "DEAD_LETTER" | "RECOVERY_REQUIRED" | "TERMINAL_FAILURE";
export type ObjectType = "Claim" | "Facility" | "Allocation" | "Commitment" | "Obligation" | "ClearingEpoch" | "Residual" | "Settlement" | "Evidence" | "ExternalExecution";
export type NodeType = "Party" | "Account" | "Relationship" | ObjectType;
export type EdgeType = "DERIVED_FROM" | "PROVEN_BY" | "SETTLED_BY" | "RECONCILES";

export interface SourceEventIdentity {
  readonly domain: string;
  readonly chainKey: number;
  readonly transactionHash: string;
  readonly eventIndex: number;
}

export interface ObservationEnvelope {
  readonly observationId: string;
  readonly sourceEventId: string;
  readonly relationshipId: string;
  readonly objectId: string;
  readonly objectType: ObjectType;
  readonly eventType: string;
  readonly sourceDomain: string;
  readonly chainKey: number;
  readonly chainId: number;
  readonly contractAddress: string;
  readonly transactionHash: string;
  readonly eventIndex: number;
  readonly blockNumber: bigint;
  readonly blockHash: string;
  readonly parentBlockHash: string | null;
  readonly observedAt: number;
  readonly normalizedPayload: Readonly<Record<string, string>>;
  readonly payloadSchemaVersion: string;
  readonly observationState: ObservationState;
  readonly finalityState: FinalityState;
  readonly evidenceId: string | null;
  readonly creditcoinReference: string | null;
  readonly projectionReference: string | null;
  readonly reconciliationReference: string | null;
  readonly evidenceMode: EvidenceMode;
  readonly adapterVersion: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface EvidenceRecord {
  readonly evidenceId: string;
  readonly relationshipId: string | null;
  readonly sourceEventId: string;
  readonly mode: EvidenceMode;
  readonly sourceDomain: string;
  readonly chainKey: number;
  readonly transactionHash: string;
  readonly blockNumber: bigint;
  readonly attestcoinReference: string | null;
  readonly status: EvidenceState;
  readonly linkedCreditcoinTransition: string | null;
  readonly sourceReference: string;
  readonly reason: string | null;
}

export interface CanonicalReference {
  readonly relationshipId: string | null;
  readonly creditcoinChainId: number;
  readonly contractAddress: string;
  readonly transactionHash: string | null;
  readonly blockNumber: bigint | null;
  readonly blockHash: string | null;
  readonly objectId: string;
  readonly state: string;
  readonly readStatus: "READ" | "UNAVAILABLE" | "CONFLICTING";
  readonly expectedState: string | null;
  readonly readAt: number;
}

export interface ProvenanceLink {
  readonly id: string;
  readonly childId: string;
  readonly parentId: string;
  readonly relation: "OBSERVED_FROM" | "PROVEN_BY" | "INTERPRETED_AS" | "CANONICALIZED_AS" | "DERIVED_FROM" | "RECONCILED_BY" | "REPLAYED_FROM";
  readonly authority: "source-chain" | "attestcoin" | "creditcoin" | "projection";
  readonly evidenceId: string | null;
}

export interface ReconciliationRecord {
  readonly id: string;
  readonly relationshipId: string;
  readonly sourceEventId: string | null;
  readonly canonicalObjectId: string | null;
  readonly state: ReconciliationState;
  readonly observationAmount: string | null;
  readonly canonicalAmount: string | null;
  readonly authority: "creditcoin" | "source-chain" | "attestcoin" | "projection";
  readonly nextAction: string;
  readonly recoveryRole: string;
  readonly reason: string;
}

export interface Checkpoint {
  readonly chainKey: number;
  readonly lastObservedBlock: bigint;
  readonly lastObservedBlockHash: string;
  readonly lastFinalizedBlock: bigint | null;
  readonly finalityPolicyVersion: string;
  readonly adapterVersion: string;
  readonly projectionSchemaVersion: string;
  readonly updatedAt: number;
  readonly replayStatus: "CURRENT" | "REPLAY_REQUIRED";
  readonly replayFromBlock: bigint | null;
  readonly replayParentBlockHash: string | null;
  readonly replaySequence: number;
}

export interface ReplayAttempt {
  readonly id: string;
  readonly chainKey: number;
  readonly fromBlock: bigint;
  readonly replacementObservationId: string;
  readonly oldBlockHash: string;
  readonly replacementBlockHash: string;
  readonly status: "SUCCEEDED" | "BLOCKED";
  readonly reason: string;
  readonly recoveryRole: string;
  readonly observedAt: number;
  readonly sequence: number;
}

export interface GraphNode {
  readonly id: string;
  readonly type: NodeType;
  readonly provenanceIds: readonly string[];
  readonly state: string;
  readonly validity: "CURRENT" | "HISTORICAL_REORGED";
}

export interface GraphEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly type: EdgeType;
  readonly provenanceIds: readonly string[];
  readonly validity: "CURRENT" | "HISTORICAL_REORGED";
}

export interface RelationshipGraph {
  readonly schemaVersion: "slice-b-graph-v1";
  readonly relationshipId: string;
  readonly scope: "relationship_projection";
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly projectionHash: string;
}

export interface SliceBState {
  readonly schemaVersion: "slice-b-read-model-v1";
  readonly observations: ReadonlyMap<string, ObservationEnvelope>;
  readonly evidence: ReadonlyMap<string, EvidenceRecord>;
  readonly canonical: ReadonlyMap<string, CanonicalReference>;
  readonly provenance: readonly ProvenanceLink[];
  readonly reconciliations: ReadonlyMap<string, ReconciliationRecord>;
  readonly checkpoints: ReadonlyMap<number, Checkpoint>;
  readonly replayHistory: readonly ReplayAttempt[];
  readonly graphs: ReadonlyMap<string, RelationshipGraph>;
  readonly deadLetters: readonly { readonly observationId: string; readonly reason: string; readonly recoveryRole: string }[];
}

export interface ReplayOptions {
  readonly finalizedBlock: bigint;
  readonly observedAt?: number;
}

export interface ReplayResult {
  readonly outcome: "REPLAYED" | "BLOCKED" | "NOOP";
  readonly state: SliceBState;
  readonly attempt: ReplayAttempt | null;
}

const hash = (...parts: readonly string[]): string => createHash("sha256").update(parts.join("|"), "utf8").digest("hex");

function canonicalize(value: unknown, ancestors = new Set<object>()): unknown {
  if (typeof value === "bigint") return `${value}n`;
  if (value === null || typeof value !== "object") return value;
  if (ancestors.has(value)) throw new Error("CYCLIC_SNAPSHOT");
  const nextAncestors = new Set(ancestors).add(value);
  if (Array.isArray(value)) return value.map((item) => canonicalize(item, nextAncestors));
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize((value as Record<string, unknown>)[key], nextAncestors)]));
}

const stableJson = (value: unknown): string => JSON.stringify(canonicalize(value));
const revive = (_key: string, value: unknown): unknown => typeof value === "string" && /^-?\d+n$/.test(value) ? BigInt(value.slice(0, -1)) : value;

export function sourceEventId(identity: SourceEventIdentity): string {
  return `source:${hash(identity.domain, String(identity.chainKey), identity.transactionHash.toLowerCase(), String(identity.eventIndex))}`;
}

export function observationId(identity: SourceEventIdentity, eventType: string): string {
  return `observation:${hash(sourceEventId(identity), eventType)}`;
}

export function createSliceBState(): SliceBState {
  return { schemaVersion: "slice-b-read-model-v1", observations: new Map(), evidence: new Map(), canonical: new Map(), provenance: [], reconciliations: new Map(), checkpoints: new Map(), replayHistory: [], graphs: new Map(), deadLetters: [] };
}

function clone(state: SliceBState, changes: Partial<SliceBState>): SliceBState {
  return { ...state, ...changes };
}

function validateObservation(input: ObservationEnvelope): void {
  if (!input.transactionHash || input.eventIndex < 0 || input.chainKey < 0 || input.blockNumber < 0n || !input.blockHash || !input.relationshipId || !input.objectId) throw new Error("INVALID_OBSERVATION");
}

function checkpointFromPrevious(chainKey: number, previous: Checkpoint | undefined, overrides: Partial<Checkpoint>): Checkpoint {
  return {
    chainKey,
    lastObservedBlock: previous?.lastObservedBlock ?? 0n,
    lastObservedBlockHash: previous?.lastObservedBlockHash ?? "",
    lastFinalizedBlock: previous?.lastFinalizedBlock ?? null,
    finalityPolicyVersion: previous?.finalityPolicyVersion ?? "proposed-local-v1",
    adapterVersion: previous?.adapterVersion ?? "slice-b-adapter-v1",
    projectionSchemaVersion: "slice-b-read-model-v1",
    updatedAt: previous?.updatedAt ?? 0,
    replayStatus: previous?.replayStatus ?? "CURRENT",
    replayFromBlock: previous?.replayFromBlock ?? null,
    replayParentBlockHash: previous?.replayParentBlockHash ?? null,
    replaySequence: previous?.replaySequence ?? 0,
    ...overrides,
  };
}

export function ingestObservation(state: SliceBState, input: ObservationEnvelope): SliceBState {
  try { validateObservation(input); } catch {
    return clone(state, { deadLetters: [...state.deadLetters, { observationId: input.observationId, reason: "malformed observation", recoveryRole: "source adapter operator" }] });
  }
  const existing = state.observations.get(input.observationId);
  if (existing) {
    if (stableJson(existing.normalizedPayload) !== stableJson(input.normalizedPayload) || existing.blockHash !== input.blockHash) {
      const observations = new Map(state.observations); observations.set(input.observationId, { ...existing, observationState: "CONFLICTING", projectionReference: `projection:${input.observationId}` }); return clone(state, { observations });
    }
    const observations = new Map(state.observations); observations.set(input.observationId, { ...existing, observationState: "DUPLICATE" }); return clone(state, { observations });
  }
  const checkpoint = state.checkpoints.get(input.chainKey);
  const observations = new Map(state.observations);
  const reorgDetected = checkpoint && input.parentBlockHash && checkpoint.lastObservedBlockHash !== input.parentBlockHash && input.blockNumber <= checkpoint.lastObservedBlock + 1n;
  if (reorgDetected) {
    for (const [id, item] of observations) if (item.chainKey === input.chainKey && item.blockNumber >= input.blockNumber) observations.set(id, { ...item, observationState: item.observationState, finalityState: "REORGED", projectionReference: `reorg:superseded:${id}` });
    observations.set(input.observationId, { ...input, finalityState: "FINALITY_PENDING", projectionReference: `reorg:candidate:${input.observationId}` });
    const checkpoints = new Map(state.checkpoints); checkpoints.set(input.chainKey, checkpointFromPrevious(input.chainKey, checkpoint, { replayStatus: "REPLAY_REQUIRED", replayFromBlock: input.blockNumber, replayParentBlockHash: input.parentBlockHash, updatedAt: input.observedAt }));
    return clone(state, { observations, checkpoints });
  }
  observations.set(input.observationId, input);
  return clone(state, { observations });
}

export function advanceFinality(state: SliceBState, chainKey: number, finalizedBlock: bigint, observedAt = Date.now()): SliceBState {
  const observations = new Map(state.observations);
  let lastObserved = 0n;
  let latestFinalized: { block: bigint; hash: string; id: string } | null = null;
  for (const [id, item] of observations) {
    if (item.chainKey !== chainKey || item.finalityState === "REORGED") continue;
    if (item.blockNumber > lastObserved) lastObserved = item.blockNumber;
    if (item.blockNumber <= finalizedBlock) {
      observations.set(id, { ...item, finalityState: "FINALIZED", updatedAt: observedAt });
      if (!latestFinalized || item.blockNumber > latestFinalized.block || (item.blockNumber === latestFinalized.block && id.localeCompare(latestFinalized.id) > 0)) latestFinalized = { block: item.blockNumber, hash: item.blockHash, id };
    } else if (item.finalityState === "UNKNOWN") {
      observations.set(id, { ...item, finalityState: "FINALITY_PENDING", updatedAt: observedAt });
    }
  }
  const previous = state.checkpoints.get(chainKey);
  const replayRequired = previous?.replayStatus === "REPLAY_REQUIRED";
  const checkpoints = new Map(state.checkpoints);
  checkpoints.set(chainKey, checkpointFromPrevious(chainKey, previous, {
    lastObservedBlock: replayRequired ? previous!.lastObservedBlock : (lastObserved || previous?.lastObservedBlock || 0n),
    lastObservedBlockHash: replayRequired ? previous!.lastObservedBlockHash : (latestFinalized?.hash ?? previous?.lastObservedBlockHash ?? ""),
    lastFinalizedBlock: finalizedBlock,
    updatedAt: observedAt,
    replayStatus: replayRequired ? "REPLAY_REQUIRED" : "CURRENT",
  }));
  return clone(state, { observations, checkpoints });
}

export function replayReorg(state: SliceBState, replacement: ObservationEnvelope, options: ReplayOptions): ReplayResult {
  const checkpoint = state.checkpoints.get(replacement.chainKey);
  const sequence = (checkpoint?.replaySequence ?? 0) + 1;
  const attemptId = `replay:${hash(String(replacement.chainKey), String(checkpoint?.replayFromBlock ?? replacement.blockNumber), replacement.observationId, replacement.blockHash)}`;
  const priorAttempt = state.replayHistory.find((attempt) => attempt.id === attemptId && attempt.status === "SUCCEEDED");
  if (priorAttempt) return { outcome: "NOOP", state, attempt: priorAttempt };
  const reason = !checkpoint || checkpoint.replayStatus !== "REPLAY_REQUIRED" ? "checkpoint is not replay-required" : checkpoint.replayFromBlock !== replacement.blockNumber ? "replacement block does not match replay cursor" : checkpoint.replayParentBlockHash !== replacement.parentBlockHash ? "replacement parent is not contiguous" : options.finalizedBlock < replacement.blockNumber ? "replacement has not reached finality" : replacement.observationState === "CONFLICTING" || replacement.observationState === "MALFORMED" || replacement.finalityState === "REORGED" ? "replacement observation is not eligible" : null;
  if (reason) {
    const attempt: ReplayAttempt = { id: attemptId, chainKey: replacement.chainKey, fromBlock: checkpoint?.replayFromBlock ?? replacement.blockNumber, replacementObservationId: replacement.observationId, oldBlockHash: checkpoint?.lastObservedBlockHash ?? "", replacementBlockHash: replacement.blockHash, status: "BLOCKED", reason, recoveryRole: "projection operator", observedAt: options.observedAt ?? replacement.observedAt, sequence };
    return { outcome: "BLOCKED", state: clone(state, { replayHistory: [...state.replayHistory, attempt] }), attempt };
  }
  const observations = new Map(state.observations);
  const existing = observations.get(replacement.observationId);
  if (existing && existing.blockHash !== replacement.blockHash) {
    const blocked: ReplayAttempt = { id: attemptId, chainKey: replacement.chainKey, fromBlock: checkpoint!.replayFromBlock!, replacementObservationId: replacement.observationId, oldBlockHash: checkpoint!.lastObservedBlockHash, replacementBlockHash: replacement.blockHash, status: "BLOCKED", reason: "replacement identity conflicts with indexed observation", recoveryRole: "projection operator", observedAt: options.observedAt ?? replacement.observedAt, sequence };
    return { outcome: "BLOCKED", state: clone(state, { replayHistory: [...state.replayHistory, blocked] }), attempt: blocked };
  }
  for (const [id, item] of observations) if (item.chainKey === replacement.chainKey && item.blockNumber >= checkpoint!.replayFromBlock! && id !== replacement.observationId) observations.set(id, { ...item, finalityState: "REORGED", projectionReference: `replay:superseded:${replacement.observationId}` });
  observations.set(replacement.observationId, { ...replacement, finalityState: "FINALIZED", projectionReference: `replay:current:${replacement.observationId}`, updatedAt: options.observedAt ?? replacement.observedAt });
  const checkpoints = new Map(state.checkpoints); checkpoints.set(replacement.chainKey, checkpointFromPrevious(replacement.chainKey, checkpoint, { lastObservedBlock: replacement.blockNumber, lastObservedBlockHash: replacement.blockHash, lastFinalizedBlock: options.finalizedBlock, replayStatus: "CURRENT", replayFromBlock: null, replayParentBlockHash: null, replaySequence: sequence, updatedAt: options.observedAt ?? replacement.observedAt }));
  const oldObservation = [...state.observations.values()].find((item) => item.chainKey === replacement.chainKey && item.blockNumber === replacement.blockNumber && item.blockHash === checkpoint!.lastObservedBlockHash);
  const provenance = oldObservation ? [...state.provenance, { id: `provenance:${hash(replacement.observationId, oldObservation.observationId)}`, childId: replacement.observationId, parentId: oldObservation.observationId, relation: "REPLAYED_FROM" as const, authority: "projection" as const, evidenceId: null }] : state.provenance;
  const attempt: ReplayAttempt = { id: attemptId, chainKey: replacement.chainKey, fromBlock: checkpoint!.replayFromBlock!, replacementObservationId: replacement.observationId, oldBlockHash: checkpoint!.lastObservedBlockHash, replacementBlockHash: replacement.blockHash, status: "SUCCEEDED", reason: "replacement finalized and replayed", recoveryRole: "projection operator", observedAt: options.observedAt ?? replacement.observedAt, sequence };
  return { outcome: "REPLAYED", state: clone(state, { observations, checkpoints, provenance, replayHistory: [...state.replayHistory, attempt] }), attempt };
}

export function recordEvidence(state: SliceBState, evidence: EvidenceRecord): SliceBState {
  const records = new Map(state.evidence); records.set(evidence.evidenceId, evidence); const observations = new Map(state.observations); for (const [id, item] of observations) if (item.sourceEventId === evidence.sourceEventId) observations.set(id, { ...item, evidenceId: evidence.evidenceId }); const provenance = [...state.provenance, { id: `provenance:${hash(evidence.evidenceId, evidence.sourceEventId)}`, childId: evidence.sourceEventId, parentId: evidence.evidenceId, relation: "PROVEN_BY" as const, authority: "attestcoin" as const, evidenceId: evidence.evidenceId }]; return clone(state, { evidence: records, observations, provenance });
}

export function recordCanonical(state: SliceBState, reference: CanonicalReference): SliceBState {
  const canonical = new Map(state.canonical); canonical.set(reference.objectId, reference); const provenance = [...state.provenance, { id: `provenance:${hash(reference.objectId, reference.contractAddress)}`, childId: reference.objectId, parentId: reference.contractAddress, relation: "CANONICALIZED_AS" as const, authority: "creditcoin" as const, evidenceId: null }]; return clone(state, { canonical, provenance });
}

export function reconcile(state: SliceBState, record: Omit<ReconciliationRecord, "id">): SliceBState {
  const value = { ...record, id: `reconciliation:${hash(record.relationshipId, record.canonicalObjectId ?? "", record.sourceEventId ?? "", record.state, record.observationAmount ?? "", record.canonicalAmount ?? "")}` }; const reconciliations = new Map(state.reconciliations); reconciliations.set(value.id, value); const provenance = [...state.provenance, { id: `provenance:${hash(value.id, value.relationshipId)}`, childId: value.relationshipId, parentId: value.id, relation: "RECONCILED_BY" as const, authority: value.authority, evidenceId: null }]; return clone(state, { reconciliations, provenance });
}

export function buildRelationshipGraph(state: SliceBState, relationshipId: string): RelationshipGraph {
  const observations = [...state.observations.values()].filter((item) => item.relationshipId === relationshipId).sort((a, b) => a.objectId.localeCompare(b.objectId) || a.eventIndex - b.eventIndex); const nodeMap = new Map<string, GraphNode>(); const edges: GraphEdge[] = [];
  const addNode = (id: string, type: NodeType, stateValue: string, validity: GraphNode["validity"], provenanceIds: readonly string[] = []): void => { if (!nodeMap.has(id)) nodeMap.set(id, { id, type, state: stateValue, validity, provenanceIds }); };
  addNode(relationshipId, "Relationship", "DERIVED", "CURRENT", observations.map((item) => item.observationId));
  for (const item of observations) { const validity = item.finalityState === "REORGED" ? "HISTORICAL_REORGED" : "CURRENT"; addNode(item.objectId, item.objectType, item.finalityState, validity, [item.observationId, ...(item.evidenceId ? [item.evidenceId] : [])]); const edgeType: EdgeType = item.objectType === "Settlement" ? "SETTLED_BY" : item.objectType === "Evidence" ? "PROVEN_BY" : "DERIVED_FROM"; edges.push({ id: `edge:${hash(relationshipId, item.objectId, edgeType, validity)}`, from: relationshipId, to: item.objectId, type: edgeType, validity, provenanceIds: [item.observationId] }); }
  for (const item of state.reconciliations.values()) if (item.relationshipId === relationshipId && item.canonicalObjectId) { addNode(item.canonicalObjectId, "ExternalExecution", item.state, "CURRENT", [item.id]); edges.push({ id: `edge:${hash(item.relationshipId, item.canonicalObjectId, "RECONCILES")}`, from: relationshipId, to: item.canonicalObjectId, type: "RECONCILES", validity: "CURRENT", provenanceIds: [item.id] }); }
  const graphBase = { schemaVersion: "slice-b-graph-v1" as const, relationshipId, scope: "relationship_projection" as const, nodes: [...nodeMap.values()].sort((a, b) => a.id.localeCompare(b.id) || a.validity.localeCompare(b.validity)), edges: edges.sort((a, b) => a.id.localeCompare(b.id)) }; return { ...graphBase, projectionHash: hash(stableJson(graphBase)) };
}

export function projectRelationship(state: SliceBState, relationshipId: string): SliceBState { const graphs = new Map(state.graphs); graphs.set(relationshipId, buildRelationshipGraph(state, relationshipId)); return clone(state, { graphs }); }

export function snapshot(state: SliceBState): string {
  return stableJson({ schemaVersion: state.schemaVersion, observations: [...state.observations.entries()].sort(([a], [b]) => a.localeCompare(b)), evidence: [...state.evidence.entries()].sort(([a], [b]) => a.localeCompare(b)), canonical: [...state.canonical.entries()].sort(([a], [b]) => a.localeCompare(b)), provenance: [...state.provenance].sort((a, b) => a.id.localeCompare(b.id)), reconciliations: [...state.reconciliations.entries()].sort(([a], [b]) => a.localeCompare(b)), checkpoints: [...state.checkpoints.entries()].sort(([a], [b]) => a - b), replayHistory: [...state.replayHistory].sort((a, b) => a.id.localeCompare(b.id)), graphs: [...state.graphs.entries()].sort(([a], [b]) => a.localeCompare(b)), deadLetters: [...state.deadLetters].sort((a, b) => a.observationId.localeCompare(b.observationId) || a.reason.localeCompare(b.reason)) });
}

export function restoreSnapshot(serialized: string): SliceBState {
  const parsed = JSON.parse(serialized, revive) as { schemaVersion: SliceBState["schemaVersion"]; observations: [string, ObservationEnvelope][]; evidence: [string, EvidenceRecord][]; canonical: [string, CanonicalReference][]; provenance: ProvenanceLink[]; reconciliations: [string, ReconciliationRecord][]; checkpoints: [number, Checkpoint][]; replayHistory: ReplayAttempt[]; graphs: [string, RelationshipGraph][]; deadLetters: SliceBState["deadLetters"] };
  if (parsed.schemaVersion !== "slice-b-read-model-v1") throw new Error("UNSUPPORTED_SNAPSHOT_SCHEMA");
  return { schemaVersion: parsed.schemaVersion, observations: new Map(parsed.observations), evidence: new Map(parsed.evidence), canonical: new Map(parsed.canonical), provenance: parsed.provenance, reconciliations: new Map(parsed.reconciliations), checkpoints: new Map(parsed.checkpoints), replayHistory: parsed.replayHistory ?? [], graphs: new Map(parsed.graphs), deadLetters: parsed.deadLetters };
}

export function snapshotHash(state: SliceBState): string { return hash(snapshot(state)); }
