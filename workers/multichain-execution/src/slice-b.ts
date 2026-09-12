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

export interface BlockHeader {
  readonly chainKey: number;
  readonly chainId: number;
  readonly sourceDomain: string;
  readonly blockNumber: bigint;
  readonly blockHash: string;
  readonly parentBlockHash: string | null;
  readonly adapterVersion: string;
  readonly payloadSchemaVersion: string;
  readonly observationId: string;
  readonly status: "CANONICAL" | "CANDIDATE" | "SUPERSEDED";
}

export interface Checkpoint {
  readonly chainKey: number;
  readonly sourceDomain: string | null;
  readonly chainId: number | null;
  readonly lastObservedBlock: bigint;
  readonly lastObservedBlockHash: string;
  readonly lastFinalizedBlock: bigint | null;
  readonly finalityPolicyVersion: string;
  readonly adapterVersion: string;
  readonly observationSchemaVersion: string;
  readonly projectionSchemaVersion: string;
  readonly updatedAt: number;
  readonly replayStatus: "CURRENT" | "REPLAY_REQUIRED";
  /** Trusted parent hash from the previously indexed canonical block header. */
  readonly replayParentBlockHash: string | null;
  readonly replayFromBlock: bigint | null;
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
  /** Keyed by relationship scope plus object ID. */
  readonly canonical: ReadonlyMap<string, CanonicalReference>;
  readonly provenance: readonly ProvenanceLink[];
  readonly reconciliations: ReadonlyMap<string, ReconciliationRecord>;
  readonly checkpoints: ReadonlyMap<number, Checkpoint>;
  readonly blockHistory: ReadonlyMap<string, BlockHeader>;
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
const blockKey = (chainKey: number, blockNumber: bigint, blockHash: string): string => `${chainKey}:${blockNumber.toString()}:${blockHash}`;
const canonicalKey = (relationshipId: string | null, objectId: string): string => `${relationshipId ?? "global"}:${objectId}`;

export function sourceEventId(identity: SourceEventIdentity): string {
  return `source:${hash(identity.domain, String(identity.chainKey), identity.transactionHash.toLowerCase(), String(identity.eventIndex))}`;
}

export function observationId(identity: SourceEventIdentity, eventType: string): string {
  return `observation:${hash(sourceEventId(identity), eventType)}`;
}

export function createSliceBState(): SliceBState {
  return { schemaVersion: "slice-b-read-model-v1", observations: new Map(), evidence: new Map(), canonical: new Map(), provenance: [], reconciliations: new Map(), checkpoints: new Map(), blockHistory: new Map(), replayHistory: [], graphs: new Map(), deadLetters: [] };
}

function clone(state: SliceBState, changes: Partial<SliceBState>): SliceBState {
  return { ...state, ...changes };
}

function addProvenance(state: SliceBState, link: ProvenanceLink): readonly ProvenanceLink[] {
  const existing = state.provenance.find((item) => item.id === link.id);
  if (existing && stableJson(existing) === stableJson(link)) return state.provenance;
  if (existing) return state.provenance;
  return [...state.provenance, link];
}

function validateObservation(input: ObservationEnvelope): void {
  const identity = { domain: input.sourceDomain, chainKey: input.chainKey, transactionHash: input.transactionHash, eventIndex: input.eventIndex };
  if (!input.transactionHash || input.eventIndex < 0 || input.chainKey < 0 || input.blockNumber < 0n || !input.blockHash || !input.relationshipId || !input.objectId || input.sourceEventId !== sourceEventId(identity) || input.observationId !== observationId(identity, input.eventType)) throw new Error("INVALID_OBSERVATION");
}

function checkpointFromPrevious(chainKey: number, previous: Checkpoint | undefined, overrides: Partial<Checkpoint>): Checkpoint {
  return {
    chainKey,
    sourceDomain: previous?.sourceDomain ?? null,
    chainId: previous?.chainId ?? null,
    lastObservedBlock: previous?.lastObservedBlock ?? 0n,
    lastObservedBlockHash: previous?.lastObservedBlockHash ?? "",
    lastFinalizedBlock: previous?.lastFinalizedBlock ?? null,
    finalityPolicyVersion: previous?.finalityPolicyVersion ?? "proposed-local-v1",
    adapterVersion: previous?.adapterVersion ?? "",
    observationSchemaVersion: previous?.observationSchemaVersion ?? "",
    projectionSchemaVersion: "slice-b-read-model-v1",
    updatedAt: previous?.updatedAt ?? 0,
    replayStatus: previous?.replayStatus ?? "CURRENT",
    replayParentBlockHash: previous?.replayParentBlockHash ?? null,
    replayFromBlock: previous?.replayFromBlock ?? null,
    replaySequence: previous?.replaySequence ?? 0,
    ...overrides,
  };
}

function blockHeaderFor(input: ObservationEnvelope, status: BlockHeader["status"]): BlockHeader {
  return { chainKey: input.chainKey, chainId: input.chainId, sourceDomain: input.sourceDomain, blockNumber: input.blockNumber, blockHash: input.blockHash, parentBlockHash: input.parentBlockHash, adapterVersion: input.adapterVersion, payloadSchemaVersion: input.payloadSchemaVersion, observationId: input.observationId, status };
}

function upsertBlockHeader(blockHistory: ReadonlyMap<string, BlockHeader>, input: ObservationEnvelope, status: BlockHeader["status"]): ReadonlyMap<string, BlockHeader> {
  const next = new Map(blockHistory);
  next.set(blockKey(input.chainKey, input.blockNumber, input.blockHash), blockHeaderFor(input, status));
  return next;
}

function canonicalHeaderFor(state: SliceBState, chainKey: number, blockNumber: bigint, blockHash: string): BlockHeader | undefined {
  return [...state.blockHistory.values()].find((header) => header.chainKey === chainKey && header.blockNumber === blockNumber && header.blockHash === blockHash && header.status === "CANONICAL");
}

function observationIdentity(input: ObservationEnvelope): Record<string, unknown> {
  return { observationId: input.observationId, sourceEventId: input.sourceEventId, relationshipId: input.relationshipId, objectId: input.objectId, objectType: input.objectType, eventType: input.eventType, sourceDomain: input.sourceDomain, chainKey: input.chainKey, chainId: input.chainId, contractAddress: input.contractAddress, transactionHash: input.transactionHash, eventIndex: input.eventIndex, blockNumber: input.blockNumber, blockHash: input.blockHash, parentBlockHash: input.parentBlockHash, normalizedPayload: input.normalizedPayload, payloadSchemaVersion: input.payloadSchemaVersion, evidenceMode: input.evidenceMode, adapterVersion: input.adapterVersion };
}

function sameReplayIdentity(left: ObservationEnvelope, right: ObservationEnvelope): boolean {
  return stableJson(observationIdentity(left)) === stableJson(observationIdentity(right));
}

function markDeadLetter(state: SliceBState, observationIdValue: string, reason: string, recoveryRole: string): SliceBState {
  if (state.deadLetters.some((item) => item.observationId === observationIdValue && item.reason === reason)) return state;
  return clone(state, { deadLetters: [...state.deadLetters, { observationId: observationIdValue, reason, recoveryRole }] });
}

export function ingestObservation(state: SliceBState, input: ObservationEnvelope): SliceBState {
  try { validateObservation(input); } catch {
    return markDeadLetter(state, input.observationId, "malformed observation", "source adapter operator");
  }
  const existing = state.observations.get(input.observationId);
  if (existing) {
    if (stableJson(observationIdentity(existing)) !== stableJson(observationIdentity(input))) {
      const observations = new Map(state.observations);
      observations.set(input.observationId, { ...existing, observationState: "CONFLICTING", projectionReference: `projection:${input.observationId}` });
      return clone(state, { observations });
    }
    if (existing.observationState === "DUPLICATE") return state;
    const observations = new Map(state.observations);
    observations.set(input.observationId, { ...existing, observationState: "DUPLICATE" });
    return clone(state, { observations });
  }

  const checkpoint = state.checkpoints.get(input.chainKey);
  const observations = new Map(state.observations);
  let blockHistory = upsertBlockHeader(state.blockHistory, input, "CANDIDATE");
  const reorgDetected = checkpoint && input.parentBlockHash && checkpoint.lastObservedBlockHash !== input.parentBlockHash && input.blockNumber <= checkpoint.lastObservedBlock + 1n;
  if (reorgDetected) {
    const oldObservation = [...observations.values()].find((item) => item.chainKey === input.chainKey && item.blockNumber === input.blockNumber && item.blockHash === checkpoint.lastObservedBlockHash && item.finalityState !== "REORGED");
    const trustedHeader = canonicalHeaderFor(state, input.chainKey, input.blockNumber, checkpoint.lastObservedBlockHash) ?? (oldObservation ? blockHeaderFor(oldObservation, "CANONICAL") : undefined);
    for (const [id, item] of observations) if (item.chainKey === input.chainKey && item.blockNumber >= input.blockNumber) observations.set(id, { ...item, finalityState: "REORGED", projectionReference: `reorg:superseded:${id}` });
    observations.set(input.observationId, { ...input, finalityState: "FINALITY_PENDING", projectionReference: `reorg:candidate:${input.observationId}` });
    const checkpoints = new Map(state.checkpoints);
    checkpoints.set(input.chainKey, checkpointFromPrevious(input.chainKey, checkpoint, {
      replayStatus: "REPLAY_REQUIRED",
      replayFromBlock: input.blockNumber,
      replayParentBlockHash: trustedHeader?.parentBlockHash ?? null,
      updatedAt: input.observedAt,
    }));
    return clone(state, { observations, checkpoints, blockHistory });
  }
  observations.set(input.observationId, input);
  return clone(state, { observations, blockHistory });
}

export function advanceFinality(state: SliceBState, chainKey: number, finalizedBlock: bigint, observedAt = Date.now()): SliceBState {
  const observations = new Map(state.observations);
  const blockHistory = new Map(state.blockHistory);
  let lastObserved = 0n;
  let latestFinalized: { item: ObservationEnvelope; id: string } | null = null;
  const previous = state.checkpoints.get(chainKey);
  const replayRequired = previous?.replayStatus === "REPLAY_REQUIRED";
  for (const [id, item] of observations) {
    if (item.chainKey !== chainKey || item.finalityState === "REORGED") continue;
    if (item.blockNumber > lastObserved) lastObserved = item.blockNumber;
    if (item.blockNumber <= finalizedBlock) {
      const finalized = { ...item, finalityState: "FINALIZED" as const, updatedAt: observedAt };
      observations.set(id, finalized);
      if (!latestFinalized || item.blockNumber > latestFinalized.item.blockNumber || (item.blockNumber === latestFinalized.item.blockNumber && id.localeCompare(latestFinalized.id) > 0)) latestFinalized = { item: finalized, id };
      const key = blockKey(item.chainKey, item.blockNumber, item.blockHash);
      const header = blockHistory.get(key);
      if (header && !replayRequired) blockHistory.set(key, { ...header, status: "CANONICAL" });
    } else if (item.finalityState === "UNKNOWN") {
      observations.set(id, { ...item, finalityState: "FINALITY_PENDING", updatedAt: observedAt });
    }
  }
  const checkpoints = new Map(state.checkpoints);
  checkpoints.set(chainKey, checkpointFromPrevious(chainKey, previous, {
    sourceDomain: replayRequired ? previous!.sourceDomain : (latestFinalized?.item.sourceDomain ?? previous?.sourceDomain ?? null),
    chainId: replayRequired ? previous!.chainId : (latestFinalized?.item.chainId ?? previous?.chainId ?? null),
    lastObservedBlock: replayRequired ? previous!.lastObservedBlock : (lastObserved || previous?.lastObservedBlock || 0n),
    lastObservedBlockHash: replayRequired ? previous!.lastObservedBlockHash : (latestFinalized?.item.blockHash ?? previous?.lastObservedBlockHash ?? ""),
    lastFinalizedBlock: finalizedBlock,
    adapterVersion: replayRequired ? previous!.adapterVersion : (latestFinalized?.item.adapterVersion ?? previous?.adapterVersion ?? ""),
    observationSchemaVersion: replayRequired ? previous!.observationSchemaVersion : (latestFinalized?.item.payloadSchemaVersion ?? previous?.observationSchemaVersion ?? ""),
    updatedAt: observedAt,
    replayStatus: replayRequired ? "REPLAY_REQUIRED" : "CURRENT",
  }));
  return clone(state, { observations, checkpoints, blockHistory });
}

function replayBaseId(chainKey: number, fromBlock: bigint, observationIdValue: string, blockHash: string): string {
  return `replay:${hash(String(chainKey), String(fromBlock), observationIdValue, blockHash)}`;
}

function blockedReplay(state: SliceBState, checkpoint: Checkpoint | undefined, replacement: ObservationEnvelope, reason: string, observedAt: number, sequence: number): ReplayResult {
  const baseId = replayBaseId(replacement.chainKey, checkpoint?.replayFromBlock ?? replacement.blockNumber, replacement.observationId, replacement.blockHash);
  const id = `${baseId}:blocked:${hash(reason)}`;
  const existing = state.replayHistory.find((attempt) => attempt.id === id);
  if (existing) return { outcome: "BLOCKED", state, attempt: existing };
  const attempt: ReplayAttempt = { id, chainKey: replacement.chainKey, fromBlock: checkpoint?.replayFromBlock ?? replacement.blockNumber, replacementObservationId: replacement.observationId, oldBlockHash: checkpoint?.lastObservedBlockHash ?? "", replacementBlockHash: replacement.blockHash, status: "BLOCKED", reason, recoveryRole: "projection operator", observedAt, sequence };
  return { outcome: "BLOCKED", state: clone(state, { replayHistory: [...state.replayHistory, attempt] }), attempt };
}

export function replayReorg(state: SliceBState, replacement: ObservationEnvelope, options: ReplayOptions): ReplayResult {
  const checkpoint = state.checkpoints.get(replacement.chainKey);
  const indexedReplacement = state.observations.get(replacement.observationId);
  const sequence = (checkpoint?.replaySequence ?? 0) + 1;
  const observedAt = options.observedAt ?? replacement.observedAt;
  const baseId = replayBaseId(replacement.chainKey, checkpoint?.replayFromBlock ?? replacement.blockNumber, replacement.observationId, replacement.blockHash);
  const priorAttempt = state.replayHistory.find((attempt) => attempt.id === baseId && attempt.status === "SUCCEEDED");
  if (priorAttempt) return { outcome: "NOOP", state, attempt: priorAttempt };
  if (!checkpoint || checkpoint.replayStatus !== "REPLAY_REQUIRED") return blockedReplay(state, checkpoint, replacement, "checkpoint is not replay-required", observedAt, sequence);
  if (!indexedReplacement) return blockedReplay(state, checkpoint, replacement, "replacement is not indexed", observedAt, sequence);
  if (!sameReplayIdentity(indexedReplacement, replacement)) return blockedReplay(state, checkpoint, replacement, "replacement identity conflicts with indexed observation", observedAt, sequence);
  const replayFromBlock = checkpoint.replayFromBlock;
  if (replayFromBlock === null) return blockedReplay(state, checkpoint, replacement, "replay cursor is unavailable", observedAt, sequence);
  const oldObservation = [...state.observations.values()].find((item) => item.chainKey === replacement.chainKey && item.blockNumber === replayFromBlock && item.blockHash === checkpoint.lastObservedBlockHash && item.finalityState === "REORGED");
  const trustedHeader = canonicalHeaderFor(state, replacement.chainKey, replayFromBlock, checkpoint.lastObservedBlockHash) ?? (oldObservation ? blockHeaderFor(oldObservation, "SUPERSEDED") : undefined);
  const reason = indexedReplacement.blockNumber !== replayFromBlock ? "replacement block does not match replay cursor" : !trustedHeader ? "trusted canonical block header is unavailable" : trustedHeader.parentBlockHash === null ? "trusted predecessor parent is unavailable" : checkpoint.replayParentBlockHash !== trustedHeader.parentBlockHash ? "checkpoint predecessor does not match trusted canonical header" : indexedReplacement.parentBlockHash !== trustedHeader.parentBlockHash ? "replacement parent does not match trusted predecessor" : checkpoint.chainId !== indexedReplacement.chainId ? "replacement chain ID does not match checkpoint" : checkpoint.sourceDomain !== indexedReplacement.sourceDomain ? "replacement source domain does not match checkpoint" : checkpoint.adapterVersion !== indexedReplacement.adapterVersion ? "replacement adapter version does not match checkpoint" : checkpoint.observationSchemaVersion !== indexedReplacement.payloadSchemaVersion ? "replacement schema version does not match checkpoint" : indexedReplacement.finalityState !== "FINALIZED" || options.finalizedBlock < indexedReplacement.blockNumber ? "replacement has not reached finality" : indexedReplacement.observationState === "CONFLICTING" || indexedReplacement.observationState === "MALFORMED" ? "replacement observation is not eligible" : indexedReplacement.blockHash === checkpoint.lastObservedBlockHash ? "replacement block hash is not a replacement" : null;
  if (reason) return blockedReplay(state, checkpoint, replacement, reason, observedAt, sequence);

  const observations = new Map(state.observations);
  for (const [id, item] of observations) if (item.chainKey === replacement.chainKey && item.blockNumber >= replayFromBlock && id !== indexedReplacement.observationId) observations.set(id, { ...item, finalityState: "REORGED", projectionReference: `replay:superseded:${indexedReplacement.observationId}` });
  observations.set(indexedReplacement.observationId, { ...indexedReplacement, finalityState: "FINALIZED", projectionReference: `replay:current:${indexedReplacement.observationId}`, updatedAt: observedAt });
  const blockHistory = new Map(state.blockHistory);
  for (const [key, header] of blockHistory) {
    if (header.chainKey === replacement.chainKey && header.blockNumber === replayFromBlock) blockHistory.set(key, { ...header, status: header.blockHash === indexedReplacement.blockHash ? "CANONICAL" : "SUPERSEDED" });
  }
  const checkpoints = new Map(state.checkpoints);
  checkpoints.set(replacement.chainKey, checkpointFromPrevious(replacement.chainKey, checkpoint, { sourceDomain: indexedReplacement.sourceDomain, chainId: indexedReplacement.chainId, lastObservedBlock: indexedReplacement.blockNumber, lastObservedBlockHash: indexedReplacement.blockHash, lastFinalizedBlock: options.finalizedBlock, adapterVersion: indexedReplacement.adapterVersion, observationSchemaVersion: indexedReplacement.payloadSchemaVersion, replayStatus: "CURRENT", replayFromBlock: null, replayParentBlockHash: null, replaySequence: sequence, updatedAt: observedAt }));
  const provenance = oldObservation ? addProvenance(state, { id: `provenance:${hash(indexedReplacement.observationId, oldObservation.observationId)}`, childId: indexedReplacement.observationId, parentId: oldObservation.observationId, relation: "REPLAYED_FROM", authority: "projection", evidenceId: null }) : state.provenance;
  const attempt: ReplayAttempt = { id: baseId, chainKey: replacement.chainKey, fromBlock: replayFromBlock, replacementObservationId: indexedReplacement.observationId, oldBlockHash: checkpoint.lastObservedBlockHash, replacementBlockHash: indexedReplacement.blockHash, status: "SUCCEEDED", reason: "replacement finalized and replayed", recoveryRole: "projection operator", observedAt, sequence };
  return { outcome: "REPLAYED", state: clone(state, { observations, checkpoints, blockHistory, provenance, replayHistory: [...state.replayHistory, attempt] }), attempt };
}

export function recordEvidence(state: SliceBState, evidence: EvidenceRecord): SliceBState {
  const existing = state.evidence.get(evidence.evidenceId);
  if (existing) {
    if (stableJson(existing) === stableJson(evidence) || (existing.status === "REJECTED" && existing.reason === "CONFLICTING_DUPLICATE")) return state;
    const records = new Map(state.evidence);
    records.set(evidence.evidenceId, { ...existing, status: "REJECTED", reason: "CONFLICTING_DUPLICATE" });
    const observations = new Map(state.observations);
    for (const [id, item] of observations) if (item.evidenceId === evidence.evidenceId || item.sourceEventId === evidence.sourceEventId) observations.set(id, { ...item, observationState: "CONFLICTING" });
    return clone(state, { evidence: records, observations });
  }
  const records = new Map(state.evidence);
  records.set(evidence.evidenceId, evidence);
  const observations = new Map(state.observations);
  for (const [id, item] of observations) if (item.sourceEventId === evidence.sourceEventId) observations.set(id, { ...item, evidenceId: evidence.evidenceId });
  const provenance = addProvenance(state, { id: `provenance:${hash(evidence.evidenceId, evidence.sourceEventId)}`, childId: evidence.sourceEventId, parentId: evidence.evidenceId, relation: "PROVEN_BY", authority: "attestcoin", evidenceId: evidence.evidenceId });
  return clone(state, { evidence: records, observations, provenance });
}

export function recordCanonical(state: SliceBState, reference: CanonicalReference): SliceBState {
  const key = canonicalKey(reference.relationshipId, reference.objectId);
  const existing = state.canonical.get(key);
  if (existing) {
    if (stableJson(existing) === stableJson(reference) || existing.readStatus === "CONFLICTING") return state;
    const canonical = new Map(state.canonical);
    canonical.set(key, { ...existing, readStatus: "CONFLICTING" });
    return clone(state, { canonical });
  }
  const canonical = new Map(state.canonical);
  canonical.set(key, reference);
  const provenance = addProvenance(state, { id: `provenance:${hash(key, reference.contractAddress)}`, childId: key, parentId: reference.contractAddress, relation: "CANONICALIZED_AS", authority: "creditcoin", evidenceId: null });
  return clone(state, { canonical, provenance });
}

export function reconcile(state: SliceBState, record: Omit<ReconciliationRecord, "id">): SliceBState {
  const value = { ...record, id: `reconciliation:${hash(record.relationshipId, record.canonicalObjectId ?? "", record.sourceEventId ?? "", record.state, record.observationAmount ?? "", record.canonicalAmount ?? "")}` };
  const existing = state.reconciliations.get(value.id);
  if (existing && stableJson(existing) === stableJson(value)) return state;
  const reconciliations = new Map(state.reconciliations);
  reconciliations.set(value.id, value);
  const provenance = addProvenance(state, { id: `provenance:${hash(value.id, value.relationshipId)}`, childId: value.relationshipId, parentId: value.id, relation: "RECONCILED_BY", authority: value.authority, evidenceId: null });
  return clone(state, { reconciliations, provenance });
}

export function buildRelationshipGraph(state: SliceBState, relationshipId: string): RelationshipGraph {
  const observations = [...state.observations.values()]
    .filter((item) => item.relationshipId === relationshipId)
    .sort((a, b) => a.objectId.localeCompare(b.objectId) || (a.finalityState === "REORGED" ? 1 : 0) - (b.finalityState === "REORGED" ? 1 : 0) || a.eventIndex - b.eventIndex || a.observationId.localeCompare(b.observationId));
  const nodeMap = new Map<string, GraphNode>();
  const edgeMap = new Map<string, GraphEdge>();
  const addNode = (id: string, type: NodeType, stateValue: string, validity: GraphNode["validity"], provenanceIds: readonly string[] = []): void => {
    const existing = nodeMap.get(id);
    if (!existing || (existing.validity === "HISTORICAL_REORGED" && validity === "CURRENT")) nodeMap.set(id, { id, type, state: stateValue, validity, provenanceIds: [...new Set(provenanceIds)].sort() });
    else if (existing.validity === validity) nodeMap.set(id, { ...existing, provenanceIds: [...new Set([...existing.provenanceIds, ...provenanceIds])].sort() });
  };
  const addEdge = (edge: GraphEdge): void => {
    const existing = edgeMap.get(edge.id);
    if (!existing) edgeMap.set(edge.id, edge);
    else edgeMap.set(edge.id, { ...existing, provenanceIds: [...new Set([...existing.provenanceIds, ...edge.provenanceIds])].sort() });
  };
  addNode(relationshipId, "Relationship", "DERIVED", "CURRENT", observations.map((item) => item.observationId));
  for (const item of observations) {
    const validity = item.finalityState === "REORGED" ? "HISTORICAL_REORGED" : "CURRENT";
    addNode(item.objectId, item.objectType, item.finalityState, validity, [item.observationId, ...(item.evidenceId ? [item.evidenceId] : [])]);
    const edgeType: EdgeType = item.objectType === "Settlement" ? "SETTLED_BY" : item.objectType === "Evidence" ? "PROVEN_BY" : "DERIVED_FROM";
    addEdge({ id: `edge:${hash(relationshipId, item.objectId, edgeType, validity)}`, from: relationshipId, to: item.objectId, type: edgeType, validity, provenanceIds: [item.observationId] });
  }
  for (const item of state.reconciliations.values()) if (item.relationshipId === relationshipId && item.canonicalObjectId) {
    addNode(item.canonicalObjectId, "ExternalExecution", item.state, "CURRENT", [item.id]);
    addEdge({ id: `edge:${hash(item.relationshipId, item.canonicalObjectId, "RECONCILES")}`, from: relationshipId, to: item.canonicalObjectId, type: "RECONCILES", validity: "CURRENT", provenanceIds: [item.id] });
  }
  const graphBase = { schemaVersion: "slice-b-graph-v1" as const, relationshipId, scope: "relationship_projection" as const, nodes: [...nodeMap.values()].sort((a, b) => a.id.localeCompare(b.id) || a.validity.localeCompare(b.validity)), edges: [...edgeMap.values()].sort((a, b) => a.id.localeCompare(b.id)) };
  return { ...graphBase, projectionHash: hash(stableJson(graphBase)) };
}

export function projectRelationship(state: SliceBState, relationshipId: string): SliceBState {
  const graphs = new Map(state.graphs);
  graphs.set(relationshipId, buildRelationshipGraph(state, relationshipId));
  return clone(state, { graphs });
}

export function snapshot(state: SliceBState): string {
  return stableJson({
    schemaVersion: state.schemaVersion,
    observations: [...state.observations.entries()].sort(([a], [b]) => a.localeCompare(b)),
    evidence: [...state.evidence.entries()].sort(([a], [b]) => a.localeCompare(b)),
    canonical: [...state.canonical.entries()].sort(([a], [b]) => a.localeCompare(b)),
    provenance: [...state.provenance].sort((a, b) => a.id.localeCompare(b.id)),
    reconciliations: [...state.reconciliations.entries()].sort(([a], [b]) => a.localeCompare(b)),
    checkpoints: [...state.checkpoints.entries()].sort(([a], [b]) => a - b),
    blockHistory: [...state.blockHistory.entries()].sort(([a], [b]) => a.localeCompare(b)),
    replayHistory: [...state.replayHistory].sort((a, b) => a.id.localeCompare(b.id)),
    graphs: [...state.graphs.entries()].sort(([a], [b]) => a.localeCompare(b)),
    deadLetters: [...state.deadLetters].sort((a, b) => a.observationId.localeCompare(b.observationId) || a.reason.localeCompare(b.reason)),
  });
}

export function restoreSnapshot(serialized: string): SliceBState {
  const parsed = JSON.parse(serialized, revive) as { schemaVersion: SliceBState["schemaVersion"]; observations: [string, ObservationEnvelope][]; evidence: [string, EvidenceRecord][]; canonical: [string, CanonicalReference][]; provenance: ProvenanceLink[]; reconciliations: [string, ReconciliationRecord][]; checkpoints: [number, Checkpoint][]; blockHistory: [string, BlockHeader][]; replayHistory: ReplayAttempt[]; graphs: [string, RelationshipGraph][]; deadLetters: SliceBState["deadLetters"] };
  if (parsed.schemaVersion !== "slice-b-read-model-v1") throw new Error("UNSUPPORTED_SNAPSHOT_SCHEMA");
  return { schemaVersion: parsed.schemaVersion, observations: new Map(parsed.observations), evidence: new Map(parsed.evidence), canonical: new Map(parsed.canonical), provenance: parsed.provenance, reconciliations: new Map(parsed.reconciliations), checkpoints: new Map(parsed.checkpoints), blockHistory: new Map(parsed.blockHistory ?? []), replayHistory: parsed.replayHistory ?? [], graphs: new Map(parsed.graphs), deadLetters: parsed.deadLetters };
}

export function snapshotHash(state: SliceBState): string { return hash(snapshot(state)); }
