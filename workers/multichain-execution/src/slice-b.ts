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

export interface EvidenceConflict {
  readonly id: string;
  readonly relationshipId: string | null;
  readonly evidenceId: string;
  readonly existingRelationshipId: string | null;
  readonly conflictingRelationshipId: string | null;
  readonly existingSourceEventId: string;
  readonly conflictingSourceEventId: string;
  readonly existingContentHash: string;
  readonly conflictingContentHash: string;
  readonly reason: string;
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

export interface DeadLetterRecord {
  readonly observationId: string;
  readonly relationshipId: string | null;
  readonly reason: string;
  readonly recoveryRole: string;
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
  readonly cursorMode: "SPARSE_EVENT";
  readonly updatedAt: number;
  readonly replayStatus: "CURRENT" | "REPLAY_REQUIRED";
  /** Trusted parent hash from the previously indexed canonical block header. */
  readonly replayParentBlockHash: string | null;
  /** Hash of the canonical header being replaced at replayFromBlock. */
  readonly replayOldBlockHash: string | null;
  readonly replayFromBlock: bigint | null;
  readonly replaySequence: number;
}

export interface ReplayAttempt {
  readonly id: string;
  readonly relationshipId: string | null;
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
  readonly evidenceConflicts: readonly EvidenceConflict[];
  /** Keyed by relationship scope plus object ID. */
  readonly canonical: ReadonlyMap<string, CanonicalReference>;
  readonly provenance: readonly ProvenanceLink[];
  /** Current record for each relationship/source/canonical reconciliation scope. */
  readonly reconciliations: ReadonlyMap<string, ReconciliationRecord>;
  /** Append-only state transitions for reconciliation investigation and audit. */
  readonly reconciliationHistory: readonly ReconciliationRecord[];
  readonly checkpoints: ReadonlyMap<number, Checkpoint>;
  readonly blockHistory: ReadonlyMap<string, BlockHeader>;
  readonly replayHistory: readonly ReplayAttempt[];
  readonly graphs: ReadonlyMap<string, RelationshipGraph>;
  readonly deadLetters: readonly DeadLetterRecord[];
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

const hash = (...parts: readonly string[]): string => createHash("sha256").update(parts.map((part) => `${part.length}:${part}`).join(""), "utf8").digest("hex");

function canonicalize(value: unknown, ancestors = new Set<object>()): unknown {
  if (typeof value === "bigint") return `${value}n`;
  if (value === null || typeof value !== "object") return value;
  if (ancestors.has(value)) throw new Error("CYCLIC_SNAPSHOT");
  const nextAncestors = new Set(ancestors).add(value);
  if (Array.isArray(value)) return value.map((item) => canonicalize(item, nextAncestors));
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize((value as Record<string, unknown>)[key], nextAncestors)]));
}

const stableJson = (value: unknown): string => JSON.stringify(canonicalize(value));
const snapshotBigInt = (value: unknown): bigint => {
  if (typeof value === "bigint") return value;
  if (typeof value === "string" && /^-?\d+n$/.test(value)) return BigInt(value.slice(0, -1));
  throw new Error("INVALID_SNAPSHOT_BIGINT");
};
const snapshotOptionalBigInt = (value: unknown): bigint | null => value === null || value === undefined ? null : snapshotBigInt(value);
const compositeKey = (...parts: readonly (string | number | bigint | null)[]): string => parts.map((part) => {
  const encoded = part === null ? "null:" : `${typeof part}:` + String(part);
  return `${encoded.length}:${encoded}`;
}).join("");
const blockKey = (chainKey: number, blockNumber: bigint, blockHash: string): string => compositeKey("block", chainKey, blockNumber, blockHash);
const canonicalKey = (relationshipId: string | null, objectId: string): string => compositeKey("canonical", relationshipId, objectId);

export function sourceEventId(identity: SourceEventIdentity): string {
  return `source:${hash(identity.domain, String(identity.chainKey), identity.transactionHash.toLowerCase(), String(identity.eventIndex))}`;
}

export function observationId(identity: SourceEventIdentity, eventType: string): string {
  return `observation:${hash(sourceEventId(identity), eventType)}`;
}

export function createSliceBState(): SliceBState {
  return { schemaVersion: "slice-b-read-model-v1", observations: new Map(), evidence: new Map(), evidenceConflicts: [], canonical: new Map(), provenance: [], reconciliations: new Map(), reconciliationHistory: [], checkpoints: new Map(), blockHistory: new Map(), replayHistory: [], graphs: new Map(), deadLetters: [] };
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
    cursorMode: "SPARSE_EVENT",
    updatedAt: previous?.updatedAt ?? 0,
    replayStatus: previous?.replayStatus ?? "CURRENT",
    replayParentBlockHash: previous?.replayParentBlockHash ?? null,
    replayOldBlockHash: previous?.replayOldBlockHash ?? null,
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
  const key = blockKey(input.chainKey, input.blockNumber, input.blockHash);
  const existing = next.get(key);
  if (!existing || !(existing.status === "CANONICAL" && status === "CANDIDATE")) next.set(key, blockHeaderFor(input, status));
  return next;
}

function canonicalHeaderAt(state: SliceBState, chainKey: number, blockNumber: bigint): BlockHeader | undefined {
  return [...state.blockHistory.values()].find((header) => header.chainKey === chainKey && header.blockNumber === blockNumber && header.status === "CANONICAL");
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

function markDeadLetter(state: SliceBState, observationIdValue: string, relationshipId: string | null, reason: string, recoveryRole: string): SliceBState {
  if (state.deadLetters.some((item) => item.observationId === observationIdValue && item.relationshipId === relationshipId && item.reason === reason)) return state;
  return clone(state, { deadLetters: [...state.deadLetters, { observationId: observationIdValue, relationshipId, reason, recoveryRole }] });
}

export function ingestObservation(state: SliceBState, input: ObservationEnvelope): SliceBState {
  try { validateObservation(input); } catch {
    const relationshipId = typeof input.relationshipId === "string" ? input.relationshipId : null;
    return markDeadLetter(state, input.observationId, relationshipId, "malformed observation", "source adapter operator");
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
  const trustedHeaderAtTarget = checkpoint ? canonicalHeaderAt(state, input.chainKey, input.blockNumber) : undefined;
  const sameCanonicalHeader = trustedHeaderAtTarget !== undefined && trustedHeaderAtTarget.blockHash === input.blockHash && trustedHeaderAtTarget.parentBlockHash === input.parentBlockHash;
  const targetHistoryUnavailable = Boolean(checkpoint && trustedHeaderAtTarget === undefined && (input.blockNumber < checkpoint.lastObservedBlock || (input.blockNumber === checkpoint.lastObservedBlock && input.blockHash !== checkpoint.lastObservedBlockHash)));
  const reorgDetected = Boolean(checkpoint && (
    targetHistoryUnavailable ||
    (trustedHeaderAtTarget !== undefined && !sameCanonicalHeader && input.blockNumber <= checkpoint.lastObservedBlock) ||
    (input.blockNumber === checkpoint.lastObservedBlock + 1n && input.parentBlockHash !== checkpoint.lastObservedBlockHash)
  ));
  const replacementForPendingReplay = Boolean(checkpoint?.replayStatus === "REPLAY_REQUIRED" && checkpoint.replayFromBlock === input.blockNumber && input.blockHash !== checkpoint.replayOldBlockHash);
  if (replacementForPendingReplay) {
    observations.set(input.observationId, { ...input, finalityState: "FINALITY_PENDING", projectionReference: `reorg:candidate:${input.observationId}` });
    return clone(state, { observations, blockHistory });
  }
  if (reorgDetected) {
    const replayOldBlockHash = trustedHeaderAtTarget?.blockHash ?? (input.blockNumber === checkpoint!.lastObservedBlock ? checkpoint!.lastObservedBlockHash : null);
    for (const [id, item] of observations) if (item.chainKey === input.chainKey && item.blockNumber >= input.blockNumber) observations.set(id, { ...item, finalityState: "REORGED", projectionReference: `reorg:superseded:${id}` });
    observations.set(input.observationId, { ...input, finalityState: "FINALITY_PENDING", projectionReference: `reorg:candidate:${input.observationId}` });
    const checkpoints = new Map(state.checkpoints);
    checkpoints.set(input.chainKey, checkpointFromPrevious(input.chainKey, checkpoint, {
      replayStatus: "REPLAY_REQUIRED",
      replayFromBlock: input.blockNumber,
      replayOldBlockHash,
      replayParentBlockHash: trustedHeaderAtTarget?.parentBlockHash ?? null,
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
  const previous = state.checkpoints.get(chainKey);
  const previousFinalized = previous?.lastFinalizedBlock ?? null;
  const effectiveFinalizedBlock = previousFinalized !== null && previousFinalized > finalizedBlock ? previousFinalized : finalizedBlock;
  const replayRequired = previous?.replayStatus === "REPLAY_REQUIRED";
  let changed = false;
  let latestObserved: { item: ObservationEnvelope; id: string } | null = null;
  let latestFinalized: { item: ObservationEnvelope; id: string } | null = null;

  for (const [id, item] of observations) {
    if (item.chainKey !== chainKey || item.finalityState === "REORGED") continue;
    if (!latestObserved || item.blockNumber > latestObserved.item.blockNumber || (item.blockNumber === latestObserved.item.blockNumber && id.localeCompare(latestObserved.id) > 0)) latestObserved = { item, id };
    if (item.blockNumber <= effectiveFinalizedBlock) {
      const finalized = item.finalityState === "FINALIZED" ? item : { ...item, finalityState: "FINALIZED" as const, updatedAt: observedAt };
      if (finalized !== item) { observations.set(id, finalized); changed = true; }
      if (!latestFinalized || item.blockNumber > latestFinalized.item.blockNumber || (item.blockNumber === latestFinalized.item.blockNumber && id.localeCompare(latestFinalized.id) > 0)) latestFinalized = { item: finalized, id };
      const key = blockKey(item.chainKey, item.blockNumber, item.blockHash);
      const header = blockHistory.get(key);
      if (header && !replayRequired && header.status !== "CANONICAL") { blockHistory.set(key, { ...header, status: "CANONICAL" }); changed = true; }
    } else if (item.finalityState === "UNKNOWN") {
      observations.set(id, { ...item, finalityState: "FINALITY_PENDING", updatedAt: observedAt });
      changed = true;
    }
  }

  const checkpoints = new Map(state.checkpoints);
  const checkpoint = checkpointFromPrevious(chainKey, previous, {
    sourceDomain: replayRequired ? previous!.sourceDomain : (latestFinalized?.item.sourceDomain ?? previous?.sourceDomain ?? null),
    chainId: replayRequired ? previous!.chainId : (latestFinalized?.item.chainId ?? previous?.chainId ?? null),
    lastObservedBlock: replayRequired ? previous!.lastObservedBlock : (latestObserved?.item.blockNumber ?? previous?.lastObservedBlock ?? 0n),
    lastObservedBlockHash: replayRequired ? previous!.lastObservedBlockHash : (latestObserved?.item.blockHash ?? previous?.lastObservedBlockHash ?? ""),
    lastFinalizedBlock: effectiveFinalizedBlock,
    adapterVersion: replayRequired ? previous!.adapterVersion : (latestFinalized?.item.adapterVersion ?? previous?.adapterVersion ?? ""),
    observationSchemaVersion: replayRequired ? previous!.observationSchemaVersion : (latestFinalized?.item.payloadSchemaVersion ?? previous?.observationSchemaVersion ?? ""),
    updatedAt: changed ? observedAt : (previous?.updatedAt ?? observedAt),
    replayStatus: replayRequired ? "REPLAY_REQUIRED" : "CURRENT",
  });
  if (previous && stableJson(previous) === stableJson(checkpoint) && !changed) return state;
  checkpoints.set(chainKey, checkpoint);
  return clone(state, { observations, checkpoints, blockHistory });
}

function replayBaseId(chainKey: number, fromBlock: bigint, observationIdValue: string, blockHash: string): string {
  return `replay:${hash(String(chainKey), String(fromBlock), observationIdValue, blockHash)}`;
}

function blockedReplay(state: SliceBState, checkpoint: Checkpoint | undefined, replacement: ObservationEnvelope, reason: string, observedAt: number, sequence: number, relationshipId: string | null): ReplayResult {
  const baseId = replayBaseId(replacement.chainKey, checkpoint?.replayFromBlock ?? replacement.blockNumber, replacement.observationId, replacement.blockHash);
  const id = `${baseId}:blocked:${hash(reason)}`;
  const existing = state.replayHistory.find((attempt) => attempt.id === id);
  if (existing) return { outcome: "BLOCKED", state, attempt: existing };
  const attempt: ReplayAttempt = { id, relationshipId, chainKey: replacement.chainKey, fromBlock: checkpoint?.replayFromBlock ?? replacement.blockNumber, replacementObservationId: replacement.observationId, oldBlockHash: checkpoint?.replayOldBlockHash ?? "", replacementBlockHash: replacement.blockHash, status: "BLOCKED", reason, recoveryRole: "projection operator", observedAt, sequence };
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
  if (!checkpoint || checkpoint.replayStatus !== "REPLAY_REQUIRED") return blockedReplay(state, checkpoint, replacement, "checkpoint is not replay-required", observedAt, sequence, replacement.relationshipId ?? null);
  if (!indexedReplacement) return blockedReplay(state, checkpoint, replacement, "replacement is not indexed", observedAt, sequence, replacement.relationshipId ?? null);
  if (!sameReplayIdentity(indexedReplacement, replacement)) return blockedReplay(state, checkpoint, replacement, "replacement identity conflicts with indexed observation", observedAt, sequence, indexedReplacement.relationshipId ?? null);
  const replayFromBlock = checkpoint.replayFromBlock;
  if (replayFromBlock === null) return blockedReplay(state, checkpoint, replacement, "replay cursor is unavailable", observedAt, sequence, indexedReplacement.relationshipId ?? null);
  const replayOldBlockHash = checkpoint.replayOldBlockHash;
  const trustedHeader = replayOldBlockHash === null ? undefined : canonicalHeaderFor(state, replacement.chainKey, replayFromBlock, replayOldBlockHash);
  const oldObservation = trustedHeader ? state.observations.get(trustedHeader.observationId) : undefined;
  const reason = indexedReplacement.blockNumber !== replayFromBlock ? "replacement block does not match replay cursor" : replayOldBlockHash === null ? "replay target old block hash is unavailable" : !trustedHeader ? "trusted canonical block header is unavailable" : trustedHeader.parentBlockHash === null ? "trusted predecessor parent is unavailable" : trustedHeader.chainKey !== replacement.chainKey || trustedHeader.blockNumber !== replayFromBlock || trustedHeader.blockHash !== replayOldBlockHash || trustedHeader.chainId !== checkpoint.chainId || trustedHeader.sourceDomain !== checkpoint.sourceDomain || trustedHeader.adapterVersion !== checkpoint.adapterVersion || trustedHeader.payloadSchemaVersion !== checkpoint.observationSchemaVersion ? "trusted canonical header metadata does not match checkpoint" : checkpoint.replayParentBlockHash !== trustedHeader.parentBlockHash ? "checkpoint predecessor does not match trusted canonical header" : indexedReplacement.parentBlockHash !== trustedHeader.parentBlockHash ? "replacement parent does not match trusted predecessor" : checkpoint.chainId !== indexedReplacement.chainId ? "replacement chain ID does not match checkpoint" : checkpoint.sourceDomain !== indexedReplacement.sourceDomain ? "replacement source domain does not match checkpoint" : checkpoint.adapterVersion !== indexedReplacement.adapterVersion ? "replacement adapter version does not match checkpoint" : checkpoint.observationSchemaVersion !== indexedReplacement.payloadSchemaVersion ? "replacement schema version does not match checkpoint" : indexedReplacement.finalityState !== "FINALIZED" || options.finalizedBlock < indexedReplacement.blockNumber ? "replacement has not reached finality" : indexedReplacement.observationState === "CONFLICTING" || indexedReplacement.observationState === "MALFORMED" ? "replacement observation is not eligible" : indexedReplacement.blockHash === replayOldBlockHash ? "replacement block hash is not a replacement" : null;
  if (reason) return blockedReplay(state, checkpoint, replacement, reason, observedAt, sequence, indexedReplacement.relationshipId ?? null);
  if (replayOldBlockHash === null || !trustedHeader) return blockedReplay(state, checkpoint, replacement, "trusted replay target unavailable", observedAt, sequence, indexedReplacement.relationshipId ?? null);
  const effectiveReplayFinality = checkpoint.lastFinalizedBlock !== null && checkpoint.lastFinalizedBlock > options.finalizedBlock ? checkpoint.lastFinalizedBlock : options.finalizedBlock;

  const observations = new Map(state.observations);
  for (const [id, item] of observations) if (item.chainKey === replacement.chainKey && item.blockNumber >= replayFromBlock && id !== indexedReplacement.observationId && item.blockHash !== indexedReplacement.blockHash) observations.set(id, { ...item, finalityState: "REORGED", projectionReference: `replay:superseded:${indexedReplacement.observationId}` });
  observations.set(indexedReplacement.observationId, { ...indexedReplacement, finalityState: "FINALIZED", projectionReference: `replay:current:${indexedReplacement.observationId}`, updatedAt: observedAt });
  const blockHistory = new Map(state.blockHistory);
  for (const [key, header] of blockHistory) {
    if (header.chainKey === replacement.chainKey && header.blockNumber === replayFromBlock) blockHistory.set(key, { ...header, status: header.blockHash === indexedReplacement.blockHash ? "CANONICAL" : "SUPERSEDED" });
  }
  const checkpoints = new Map(state.checkpoints);
  checkpoints.set(replacement.chainKey, checkpointFromPrevious(replacement.chainKey, checkpoint, { sourceDomain: indexedReplacement.sourceDomain, chainId: indexedReplacement.chainId, lastObservedBlock: indexedReplacement.blockNumber, lastObservedBlockHash: indexedReplacement.blockHash, lastFinalizedBlock: effectiveReplayFinality, adapterVersion: indexedReplacement.adapterVersion, observationSchemaVersion: indexedReplacement.payloadSchemaVersion, replayStatus: "CURRENT", replayFromBlock: null, replayOldBlockHash: null, replayParentBlockHash: null, replaySequence: sequence, updatedAt: observedAt }));
  const provenance = oldObservation ? addProvenance(state, { id: `provenance:${hash(indexedReplacement.observationId, oldObservation.observationId)}`, childId: indexedReplacement.observationId, parentId: oldObservation.observationId, relation: "REPLAYED_FROM", authority: "projection", evidenceId: null }) : state.provenance;
  const attempt: ReplayAttempt = { id: baseId, relationshipId: indexedReplacement.relationshipId ?? null, chainKey: replacement.chainKey, fromBlock: replayFromBlock, replacementObservationId: indexedReplacement.observationId, oldBlockHash: replayOldBlockHash, replacementBlockHash: indexedReplacement.blockHash, status: "SUCCEEDED", reason: "replacement finalized and replayed", recoveryRole: "projection operator", observedAt, sequence };
  return { outcome: "REPLAYED", state: clone(state, { observations, checkpoints, blockHistory, provenance, replayHistory: [...state.replayHistory, attempt] }), attempt };
}

export function recordEvidence(state: SliceBState, evidence: EvidenceRecord): SliceBState {
  const existing = state.evidence.get(evidence.evidenceId);
  if (existing) {
    if (stableJson(existing) === stableJson(evidence)) return state;
    const conflictId = `evidence-conflict:${hash(evidence.evidenceId, stableJson(evidence))}`;
    if (state.evidenceConflicts.some((conflict) => conflict.id === conflictId)) return state;
    const observations = new Map(state.observations);
    for (const [id, item] of observations) if (item.sourceEventId === evidence.sourceEventId) observations.set(id, { ...item, observationState: "CONFLICTING" });
    const conflict: EvidenceConflict = { id: conflictId, relationshipId: evidence.relationshipId, evidenceId: evidence.evidenceId, existingRelationshipId: existing.relationshipId, conflictingRelationshipId: evidence.relationshipId, existingSourceEventId: existing.sourceEventId, conflictingSourceEventId: evidence.sourceEventId, existingContentHash: hash(stableJson(existing)), conflictingContentHash: hash(stableJson(evidence)), reason: "same globally unique evidence ID has conflicting content" };
    return clone(state, { evidenceConflicts: [...state.evidenceConflicts, conflict], observations });
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

function reconciliationKey(record: Pick<ReconciliationRecord, "relationshipId" | "canonicalObjectId" | "sourceEventId">): string {
  return compositeKey("reconciliation", record.relationshipId, record.canonicalObjectId, record.sourceEventId);
}

export function reconcile(state: SliceBState, record: Omit<ReconciliationRecord, "id">): SliceBState {
  const scopeKey = reconciliationKey(record);
  const value = { ...record, id: `reconciliation:${hash(scopeKey, stableJson(record))}` };
  const existing = state.reconciliations.get(scopeKey);
  if (existing && stableJson(existing) === stableJson(value)) return state;
  const reconciliations = new Map(state.reconciliations);
  reconciliations.set(scopeKey, value);
  const historyValue = { ...value, id: `reconciliation-history:${hash(scopeKey, stableJson(record), existing?.id ?? "")}` };
  const reconciliationHistory = state.reconciliationHistory.some((item) => item.id === historyValue.id) ? state.reconciliationHistory : [...state.reconciliationHistory, historyValue];
  const provenance = addProvenance(state, { id: `provenance:${hash(value.id, value.relationshipId)}`, childId: value.relationshipId, parentId: value.id, relation: "RECONCILED_BY", authority: value.authority, evidenceId: null });
  return clone(state, { reconciliations, reconciliationHistory, provenance });
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
    evidenceConflicts: [...state.evidenceConflicts].sort((a, b) => a.id.localeCompare(b.id)),
    canonical: [...state.canonical.entries()].sort(([a], [b]) => a.localeCompare(b)),
    provenance: [...state.provenance].sort((a, b) => a.id.localeCompare(b.id)),
    reconciliations: [...state.reconciliations.entries()].sort(([a], [b]) => a.localeCompare(b)),
    reconciliationHistory: [...state.reconciliationHistory].sort((a, b) => a.id.localeCompare(b.id)),
    checkpoints: [...state.checkpoints.entries()].sort(([a], [b]) => a - b),
    blockHistory: [...state.blockHistory.entries()].sort(([a], [b]) => a.localeCompare(b)),
    replayHistory: [...state.replayHistory].sort((a, b) => a.id.localeCompare(b.id)),
    graphs: [...state.graphs.entries()].sort(([a], [b]) => a.localeCompare(b)),
    deadLetters: [...state.deadLetters].sort((a, b) => a.observationId.localeCompare(b.observationId) || (a.relationshipId ?? "").localeCompare(b.relationshipId ?? "") || a.reason.localeCompare(b.reason)),
  });
}

export function restoreSnapshot(serialized: string): SliceBState {
  const parsed = JSON.parse(serialized) as {
    schemaVersion: SliceBState["schemaVersion"];
    observations?: [string, ObservationEnvelope][];
    evidence?: [string, EvidenceRecord][];
    evidenceConflicts?: EvidenceConflict[];
    canonical?: [string, CanonicalReference][];
    provenance?: ProvenanceLink[];
    reconciliations?: [string, ReconciliationRecord][];
    reconciliationHistory?: ReconciliationRecord[];
    checkpoints?: [number, Record<string, unknown>][];
    blockHistory?: [string, BlockHeader][];
    replayHistory?: Record<string, unknown>[];
    graphs?: [string, RelationshipGraph][];
    deadLetters?: Record<string, unknown>[];
  };
  if (parsed.schemaVersion !== "slice-b-read-model-v1") throw new Error("UNSUPPORTED_SNAPSHOT_SCHEMA");
  const observations = new Map((parsed.observations ?? []).map(([key, item]) => [key, { ...item, blockNumber: snapshotBigInt(item.blockNumber) } as ObservationEnvelope] as [string, ObservationEnvelope]));
  const evidence = new Map((parsed.evidence ?? []).map(([key, item]) => [key, { ...item, blockNumber: snapshotBigInt(item.blockNumber) } as EvidenceRecord] as [string, EvidenceRecord]));
  const checkpoints = new Map((parsed.checkpoints ?? []).map(([key, checkpoint]) => [key, { ...checkpoint, lastObservedBlock: snapshotBigInt(checkpoint.lastObservedBlock), lastFinalizedBlock: snapshotOptionalBigInt(checkpoint.lastFinalizedBlock), cursorMode: checkpoint.cursorMode ?? "SPARSE_EVENT", replayStatus: checkpoint.replayStatus ?? "CURRENT", replayParentBlockHash: checkpoint.replayParentBlockHash ?? null, replayOldBlockHash: checkpoint.replayOldBlockHash ?? null, replayFromBlock: snapshotOptionalBigInt(checkpoint.replayFromBlock), replaySequence: checkpoint.replaySequence ?? 0 } as unknown as Checkpoint] as [number, Checkpoint]));
  const replayHistory = (parsed.replayHistory ?? []).map((attempt) => ({ ...attempt, fromBlock: snapshotBigInt(attempt.fromBlock), relationshipId: attempt.relationshipId ?? null } as unknown as ReplayAttempt));
  const deadLetters = (parsed.deadLetters ?? []).map((item) => ({ ...item, relationshipId: item.relationshipId ?? null } as unknown as DeadLetterRecord));
  const reconciliationRecords = parsed.reconciliations ?? [];
  const reconciliations = new Map(reconciliationRecords.map(([, record]) => [reconciliationKey(record), record] as [string, ReconciliationRecord]));
  const reconciliationHistory = parsed.reconciliationHistory ?? reconciliationRecords.map(([, record]) => {
    const scopeKey = reconciliationKey(record);
    const { id: _legacyId, ...recordWithoutId } = record;
    return { ...record, id: `reconciliation-history:${hash(scopeKey, stableJson(recordWithoutId), "")}` };
  });
  const canonical = new Map((parsed.canonical ?? []).map(([, reference]) => [canonicalKey(reference.relationshipId, reference.objectId), { ...reference, blockNumber: snapshotOptionalBigInt(reference.blockNumber) } as CanonicalReference] as [string, CanonicalReference]));
  const blockHistory = new Map((parsed.blockHistory ?? []).map(([, header]) => [blockKey(header.chainKey, snapshotBigInt(header.blockNumber), header.blockHash), { ...header, blockNumber: snapshotBigInt(header.blockNumber) } as BlockHeader] as [string, BlockHeader]));
  return { schemaVersion: parsed.schemaVersion, observations, evidence, evidenceConflicts: parsed.evidenceConflicts ?? [], canonical, provenance: parsed.provenance ?? [], reconciliations, reconciliationHistory, checkpoints, blockHistory, replayHistory, graphs: new Map(parsed.graphs ?? []), deadLetters };
}

export function snapshotHash(state: SliceBState): string { return hash(snapshot(state)); }
