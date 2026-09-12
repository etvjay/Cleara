import { createHash } from "node:crypto";

export type EvidenceMode = "live_testnet" | "fixture_from_live_evidence" | "composite_fixture" | "implemented_local";
export type ObservationState = "OBSERVED" | "MALFORMED" | "DUPLICATE" | "CONFLICTING" | "UNAVAILABLE" | "REJECTED";
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
  readonly chainId?: number;
  readonly transactionHash: string;
  readonly eventIndex?: number;
  readonly blockNumber: bigint;
  readonly blockHash?: string;
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
  readonly existingContent?: EvidenceRecord;
  readonly conflictingContent?: EvidenceRecord;
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

export interface DeadLetterRecord {
  readonly observationId: string;
  readonly relationshipId: string | null;
  readonly reason: string;
  readonly recoveryRole: string;
  readonly nextAction: string;
  readonly kind: "OBSERVATION" | "EVIDENCE" | "CANONICAL" | "RECONCILIATION" | "FINALITY" | "REPLAY" | "SNAPSHOT";
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
  readonly sequence: number;
  readonly occurredAt: number;
}

export type ReconciliationInput = Omit<ReconciliationRecord, "id" | "sequence" | "occurredAt"> & {
  readonly sequence?: number;
  readonly occurredAt?: number;
};

export interface ReplayTarget {
  readonly chainKey: number;
  readonly blockNumber: bigint;
  readonly oldBlockHash: string | null;
  readonly oldParentBlockHash: string | null;
  readonly expectedParentBlockHash: string | null;
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
  readonly replayReason: string | null;
  readonly replayOwner: string | null;
  readonly replayRecoveryRole: string | null;
  readonly replayNextAction: string | null;
  readonly replayTargets: readonly ReplayTarget[];
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
  readonly finalizedBlock: bigint;
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

class SliceBValidationError extends Error {
  readonly code = "INVALID_INPUT";
  constructor(readonly reason: string) {
    super(reason);
    this.name = "SliceBValidationError";
  }
}

const observationStates = new Set<ObservationState>(["OBSERVED", "MALFORMED", "DUPLICATE", "CONFLICTING", "UNAVAILABLE", "REJECTED"]);
const finalityStates = new Set<FinalityState>(["UNKNOWN", "FINALITY_PENDING", "FINALIZED", "REORGED"]);
const evidenceModes = new Set<EvidenceMode>(["live_testnet", "fixture_from_live_evidence", "composite_fixture", "implemented_local"]);
const evidenceStates = new Set<EvidenceState>(["NOT_REQUIRED", "NOT_REQUESTED", "PENDING", "ACCEPTED", "REJECTED", "CONSUMED", "STALE"]);
const canonicalStates = new Set<CanonicalReference["readStatus"]>(["READ", "UNAVAILABLE", "CONFLICTING"]);
const reconciliationStates = new Set<ReconciliationState>(["UNKNOWN", "PENDING", "RECONCILED", "MISMATCH", "STALE", "REORG_DETECTED", "REJECTED"]);
const authorities = new Set<ReconciliationRecord["authority"]>(["creditcoin", "source-chain", "attestcoin", "projection"]);
const objectTypes = new Set<ObjectType>(["Claim", "Facility", "Allocation", "Commitment", "Obligation", "ClearingEpoch", "Residual", "Settlement", "Evidence", "ExternalExecution"]);

function requireString(value: unknown, field: string, allowEmpty = false): asserts value is string {
  if (typeof value !== "string" || (!allowEmpty && (value.length === 0 || value.trim() !== value))) throw new SliceBValidationError(`${field} must be a nonempty trimmed string`);
}
function requireNullableString(value: unknown, field: string): asserts value is string | null {
  if (value !== null) requireString(value, field);
}
function requireFiniteNumber(value: unknown, field: string, integer = false, positive = false): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || (integer && !Number.isSafeInteger(value)) || (positive ? value <= 0 : value < 0)) throw new SliceBValidationError(`${field} must be a finite ${positive ? "positive " : "nonnegative "}${integer ? "integer" : "number"}`);
}
function requireBigInt(value: unknown, field: string): asserts value is bigint {
  if (typeof value !== "bigint" || value < 0n) throw new SliceBValidationError(`${field} must be a nonnegative bigint`);
}
function requireEnum<T>(value: unknown, values: ReadonlySet<T>, field: string): asserts value is T {
  if (!values.has(value as T)) throw new SliceBValidationError(`${field} is not a supported enum value`);
}
function requirePlainRecord(value: unknown, field: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) || !([Object.prototype, null] as unknown[]).includes(Object.getPrototypeOf(value))) throw new SliceBValidationError(`${field} must be a plain object`);
  for (const key of Object.keys(value)) {
    if (["__proto__", "constructor", "prototype"].includes(key)) throw new SliceBValidationError(`${field} contains an unsafe key`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) throw new SliceBValidationError(`${field} contains an accessor`);
    if (typeof descriptor.value !== "string") throw new SliceBValidationError(`${field}.${key} must be a string`);
  }
}
function validateObservation(input: ObservationEnvelope): void {
  requireString(input.observationId, "observationId"); requireString(input.sourceEventId, "sourceEventId"); requireString(input.relationshipId, "relationshipId"); requireString(input.objectId, "objectId"); requireEnum(input.objectType, objectTypes, "objectType"); requireString(input.eventType, "eventType"); requireString(input.sourceDomain, "sourceDomain"); requireFiniteNumber(input.chainKey, "chainKey", true); requireFiniteNumber(input.chainId, "chainId", true, true); requireString(input.contractAddress, "contractAddress"); requireString(input.transactionHash, "transactionHash"); requireFiniteNumber(input.eventIndex, "eventIndex", true); requireBigInt(input.blockNumber, "blockNumber"); requireString(input.blockHash, "blockHash"); requireNullableString(input.parentBlockHash, "parentBlockHash"); requireFiniteNumber(input.observedAt, "observedAt"); requirePlainRecord(input.normalizedPayload, "normalizedPayload"); requireString(input.payloadSchemaVersion, "payloadSchemaVersion"); requireEnum(input.observationState, observationStates, "observationState"); requireEnum(input.finalityState, finalityStates, "finalityState"); requireEnum(input.evidenceMode, evidenceModes, "evidenceMode"); requireString(input.adapterVersion, "adapterVersion"); requireFiniteNumber(input.createdAt, "createdAt"); requireFiniteNumber(input.updatedAt, "updatedAt");
  const identity = { domain: input.sourceDomain, chainKey: input.chainKey, transactionHash: input.transactionHash, eventIndex: input.eventIndex };
  if (input.sourceEventId !== sourceEventId(identity) || input.observationId !== observationId(identity, input.eventType)) throw new SliceBValidationError("observation identity hash does not match its source fields");
}
function validateEvidence(evidence: EvidenceRecord): void {
  requireString(evidence.evidenceId, "evidenceId"); if (evidence.relationshipId !== null) requireString(evidence.relationshipId, "relationshipId"); requireString(evidence.sourceEventId, "sourceEventId"); requireEnum(evidence.mode, evidenceModes, "mode"); requireString(evidence.sourceDomain, "sourceDomain"); requireFiniteNumber(evidence.chainKey, "chainKey", true); requireFiniteNumber(evidence.chainId, "chainId", true, true); requireString(evidence.transactionHash, "transactionHash"); requireFiniteNumber(evidence.eventIndex, "eventIndex", true); requireBigInt(evidence.blockNumber, "blockNumber"); requireString(evidence.blockHash, "blockHash"); requireNullableString(evidence.attestcoinReference, "attestcoinReference"); requireEnum(evidence.status, evidenceStates, "status"); requireNullableString(evidence.linkedCreditcoinTransition, "linkedCreditcoinTransition"); requireString(evidence.sourceReference, "sourceReference"); requireNullableString(evidence.reason, "reason");
}
function validateCanonical(reference: CanonicalReference): void {
  if (reference.relationshipId !== null) requireString(reference.relationshipId, "relationshipId"); requireFiniteNumber(reference.creditcoinChainId, "creditcoinChainId", true, true); requireString(reference.contractAddress, "contractAddress"); requireNullableString(reference.transactionHash, "transactionHash"); if (reference.blockNumber !== null) requireBigInt(reference.blockNumber, "blockNumber"); requireNullableString(reference.blockHash, "blockHash"); requireString(reference.objectId, "objectId"); requireString(reference.state, "state"); requireEnum(reference.readStatus, canonicalStates, "readStatus"); requireNullableString(reference.expectedState, "expectedState"); requireFiniteNumber(reference.readAt, "readAt");
}
function validateReconciliation(record: ReconciliationInput): void {
  requireString(record.relationshipId, "relationshipId"); if (record.sourceEventId !== null) requireString(record.sourceEventId, "sourceEventId"); if (record.canonicalObjectId !== null) requireString(record.canonicalObjectId, "canonicalObjectId"); requireEnum(record.state, reconciliationStates, "state"); requireNullableString(record.observationAmount, "observationAmount"); requireNullableString(record.canonicalAmount, "canonicalAmount"); requireEnum(record.authority, authorities, "authority"); requireString(record.nextAction, "nextAction"); requireString(record.recoveryRole, "recoveryRole"); requireString(record.reason, "reason"); if (record.sequence !== undefined) requireFiniteNumber(record.sequence, "sequence", true); if (record.occurredAt !== undefined) requireFiniteNumber(record.occurredAt, "occurredAt");
}
function sanitizeObservation(input: ObservationEnvelope): ObservationEnvelope {
  return { ...input, observationState: "OBSERVED", finalityState: "UNKNOWN" };
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
    replayReason: previous?.replayReason ?? null,
    replayOwner: previous?.replayOwner ?? null,
    replayRecoveryRole: previous?.replayRecoveryRole ?? null,
    replayNextAction: previous?.replayNextAction ?? null,
    replayTargets: previous?.replayTargets ?? [],
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
  if (status === "CANONICAL") {
    const competingCanonical = [...next.entries()].find(([otherKey, header]) => otherKey !== key && header.chainKey === input.chainKey && header.blockNumber === input.blockNumber && header.status === "CANONICAL" && header.blockHash !== input.blockHash);
    if (competingCanonical) {
      for (const [otherKey, header] of next) if (header.chainKey === input.chainKey && header.blockNumber === input.blockNumber && header.status === "CANONICAL") next.set(otherKey, { ...header, status: "CANDIDATE" });
      next.set(key, blockHeaderFor(input, "CANDIDATE"));
    } else {
      for (const [otherKey, header] of next) if (otherKey !== key && header.chainKey === input.chainKey && header.blockNumber === input.blockNumber && header.status === "CANONICAL") next.set(otherKey, { ...header, status: "SUPERSEDED" });
      next.set(key, blockHeaderFor(input, "CANONICAL"));
    }
  } else if (!existing || !(existing.status === "CANONICAL" && status === "CANDIDATE")) next.set(key, blockHeaderFor(input, status));
  return next;
}

function supersedeLaterCanonicalHeaders(blockHistory: ReadonlyMap<string, BlockHeader>, chainKey: number, fromBlock: bigint): ReadonlyMap<string, BlockHeader> {
  const next = new Map(blockHistory);
  for (const [key, header] of next) {
    if (header.chainKey === chainKey && header.blockNumber > fromBlock && header.status === "CANONICAL") next.set(key, { ...header, status: "SUPERSEDED" });
  }
  return next;
}

function canonicalHeaderAt(state: SliceBState, chainKey: number, blockNumber: bigint): BlockHeader | undefined {
  return [...state.blockHistory.values()].find((header) => header.chainKey === chainKey && header.blockNumber === blockNumber && header.status === "CANONICAL");
}

function canonicalHeaderFor(state: SliceBState, chainKey: number, blockNumber: bigint, blockHash: string): BlockHeader | undefined {
  return [...state.blockHistory.values()].find((header) => header.chainKey === chainKey && header.blockNumber === blockNumber && header.blockHash === blockHash && header.status === "CANONICAL");
}

function replayTargetsFromState(state: SliceBState, chainKey: number, fromBlock: bigint): readonly ReplayTarget[] {
  const blockNumbers = new Set<bigint>([fromBlock]);
  for (const item of state.observations.values()) if (item.chainKey === chainKey && item.blockNumber >= fromBlock) blockNumbers.add(item.blockNumber);
  for (const header of state.blockHistory.values()) if (header.chainKey === chainKey && header.blockNumber >= fromBlock && header.status === "CANONICAL") blockNumbers.add(header.blockNumber);
  return [...blockNumbers].sort((left, right) => left < right ? -1 : left > right ? 1 : 0).map((blockNumber) => {
    const header = canonicalHeaderAt(state, chainKey, blockNumber);
    return { chainKey, blockNumber, oldBlockHash: header?.blockHash ?? null, oldParentBlockHash: header?.parentBlockHash ?? null, expectedParentBlockHash: header?.parentBlockHash ?? null };
  });
}

function pendingReplayTargets(checkpoint: Checkpoint): readonly ReplayTarget[] {
  if (checkpoint.replayTargets.length > 0) return checkpoint.replayTargets;
  if (checkpoint.replayStatus !== "REPLAY_REQUIRED" || checkpoint.replayFromBlock === null) return [];
  return [{ chainKey: checkpoint.chainKey, blockNumber: checkpoint.replayFromBlock, oldBlockHash: checkpoint.replayOldBlockHash, oldParentBlockHash: checkpoint.replayParentBlockHash, expectedParentBlockHash: checkpoint.replayParentBlockHash }];
}

function replayCheckpointOverrides(targets: readonly ReplayTarget[], reason: string | null, nextAction: string | null): Partial<Checkpoint> {
  const first = targets[0];
  return {
    replayStatus: targets.length > 0 ? "REPLAY_REQUIRED" : "CURRENT",
    replayReason: targets.length > 0 ? reason : null,
    replayOwner: targets.length > 0 ? "projection operator" : null,
    replayRecoveryRole: targets.length > 0 ? "projection operator" : null,
    replayNextAction: targets.length > 0 ? nextAction : null,
    replayTargets: targets,
    replayFromBlock: first?.blockNumber ?? null,
    replayOldBlockHash: first?.oldBlockHash ?? null,
    replayParentBlockHash: first?.expectedParentBlockHash ?? null,
  };
}

function evidenceMatchesObservation(evidence: EvidenceRecord, observation: ObservationEnvelope): boolean {
  if (observation.finalityState === "REORGED" || ["CONFLICTING", "MALFORMED", "REJECTED", "UNAVAILABLE"].includes(observation.observationState)) return false;
  return evidence.relationshipId === observation.relationshipId && evidence.sourceEventId === observation.sourceEventId && evidence.sourceDomain === observation.sourceDomain && evidence.chainKey === observation.chainKey && evidence.chainId === observation.chainId && evidence.transactionHash.toLowerCase() === observation.transactionHash.toLowerCase() && evidence.eventIndex === observation.eventIndex && evidence.blockNumber === observation.blockNumber && evidence.blockHash === observation.blockHash;
}

function attachKnownEvidence(state: SliceBState, observations: Map<string, ObservationEnvelope>, input: ObservationEnvelope): readonly ProvenanceLink[] {
  const evidence = [...state.evidence.values()].find((candidate) => evidenceMatchesObservation(candidate, input));
  if (!evidence) return state.provenance;
  observations.set(input.observationId, { ...input, evidenceId: evidence.evidenceId });
  return addProvenance(state, { id: `provenance:${hash(evidence.evidenceId, input.sourceEventId)}`, childId: input.sourceEventId, parentId: evidence.evidenceId, relation: "PROVEN_BY", authority: "attestcoin", evidenceId: evidence.evidenceId });
}

function invalidateReorgDependencies(state: SliceBState, affected: readonly ObservationEnvelope[]): SliceBState {
  const sourceEventIds = new Set(affected.map((item) => item.sourceEventId));
  const evidenceIds = new Set(affected.flatMap((item) => item.evidenceId ? [item.evidenceId] : []));
  const evidence = new Map(state.evidence);
  for (const evidenceId of evidenceIds) {
    const record = evidence.get(evidenceId);
    if (record && record.status !== "STALE") evidence.set(evidenceId, { ...record, status: "STALE", reason: "linked observation was superseded by reorg" });
  }
  let next = clone(state, { evidence });
  for (const item of state.reconciliations.values()) if (item.sourceEventId !== null && sourceEventIds.has(item.sourceEventId) && item.state !== "REORG_DETECTED") { const { id: _id, sequence: _sequence, occurredAt: _occurredAt, ...input } = item; next = reconcile(next, { ...input, state: "REORG_DETECTED", nextAction: "revalidate replacement observation and evidence", recoveryRole: "projection operator", reason: "source observation was superseded by reorg" }); }
  return next;
}

function observationIdentity(input: ObservationEnvelope): Record<string, unknown> {
  return { observationId: input.observationId, sourceEventId: input.sourceEventId, relationshipId: input.relationshipId, objectId: input.objectId, objectType: input.objectType, eventType: input.eventType, sourceDomain: input.sourceDomain, chainKey: input.chainKey, chainId: input.chainId, contractAddress: input.contractAddress, transactionHash: input.transactionHash, eventIndex: input.eventIndex, blockNumber: input.blockNumber, blockHash: input.blockHash, parentBlockHash: input.parentBlockHash, normalizedPayload: input.normalizedPayload, payloadSchemaVersion: input.payloadSchemaVersion, evidenceMode: input.evidenceMode, adapterVersion: input.adapterVersion };
}

function sameReplayIdentity(left: ObservationEnvelope, right: ObservationEnvelope): boolean {
  return stableJson(observationIdentity(left)) === stableJson(observationIdentity(right));
}

function markDeadLetter(state: SliceBState, observationIdValue: string, relationshipId: string | null, reason: string, recoveryRole: string, nextAction = "repair input and retry", kind: DeadLetterRecord["kind"] = "OBSERVATION"): SliceBState {
  if (state.deadLetters.some((item) => item.observationId === observationIdValue && item.relationshipId === relationshipId && item.reason === reason && item.kind === kind)) return state;
  return clone(state, { deadLetters: [...state.deadLetters, { observationId: observationIdValue, relationshipId, reason, recoveryRole, nextAction, kind }] });
}

export function ingestObservation(state: SliceBState, input: ObservationEnvelope): SliceBState {
  try {
    validateObservation(input);
  } catch (error) {
    const relationshipId = typeof input.relationshipId === "string" ? input.relationshipId : null;
    const reason = error instanceof SliceBValidationError ? error.reason : "malformed observation";
    return markDeadLetter(state, typeof input.observationId === "string" ? input.observationId : "observation:invalid", relationshipId, reason, "source adapter operator", "repair observation and retry", "OBSERVATION");
  }
  input = sanitizeObservation(input);
  const existing = state.observations.get(input.observationId);
  if (existing) {
    if (stableJson(observationIdentity(existing)) !== stableJson(observationIdentity(input))) {
      const observations = new Map(state.observations);
      observations.set(input.observationId, { ...existing, observationState: "CONFLICTING", finalityState: "UNKNOWN", projectionReference: `projection:${input.observationId}` });
      const blockHistory = new Map(state.blockHistory);
      for (const [key, header] of blockHistory) if (header.observationId === existing.observationId && header.status === "CANONICAL") {
        const alternate = [...state.observations.values()].find((item) => item.observationId !== existing.observationId && item.chainKey === existing.chainKey && item.blockNumber === existing.blockNumber && item.blockHash === existing.blockHash && !["CONFLICTING", "MALFORMED", "REJECTED", "UNAVAILABLE"].includes(item.observationState));
        blockHistory.set(key, alternate ? { ...header, observationId: alternate.observationId } : { ...header, status: "SUPERSEDED" });
      }
      const nextState = clone(state, { observations, blockHistory });
      return existing.blockNumber !== input.blockNumber || existing.blockHash !== input.blockHash ? markDeadLetter(nextState, `continuity:${input.sourceEventId}`, input.relationshipId, "same source transaction/event was observed at a different block", "reorg recovery operator", "validate parent continuity and submit a finalized replay replacement", "OBSERVATION") : nextState;
    }
    if (existing.observationState === "DUPLICATE") return state;
    const observations = new Map(state.observations);
    observations.set(input.observationId, { ...existing, observationState: "DUPLICATE" });
    return clone(state, { observations });
  }

  const checkpoint = state.checkpoints.get(input.chainKey);
  if (checkpoint && ((checkpoint.chainId !== null && checkpoint.chainId !== input.chainId) || (checkpoint.sourceDomain !== null && checkpoint.sourceDomain !== input.sourceDomain) || (checkpoint.adapterVersion !== "" && checkpoint.adapterVersion !== input.adapterVersion) || (checkpoint.observationSchemaVersion !== "" && checkpoint.observationSchemaVersion !== input.payloadSchemaVersion))) return markDeadLetter(state, input.observationId, input.relationshipId, "observation metadata does not match established checkpoint profile", "source adapter operator", "repair chain/domain/adapter/schema metadata and retry", "OBSERVATION");
  const observations = new Map(state.observations);
  const canExtendCanonicalTip = !checkpoint || (checkpoint.replayStatus === "CURRENT" && input.blockNumber === checkpoint.lastObservedBlock + 1n && input.parentBlockHash === checkpoint.lastObservedBlockHash);
  let blockHistory = upsertBlockHeader(state.blockHistory, input, canExtendCanonicalTip ? "CANONICAL" : "CANDIDATE");
  const trustedHeaderAtTarget = checkpoint ? canonicalHeaderAt(state, input.chainKey, input.blockNumber) : undefined;
  const sameCanonicalHeader = trustedHeaderAtTarget !== undefined && trustedHeaderAtTarget.blockHash === input.blockHash && trustedHeaderAtTarget.parentBlockHash === input.parentBlockHash;
  const targetHistoryUnavailable = Boolean(checkpoint && trustedHeaderAtTarget === undefined && (input.blockNumber < checkpoint.lastObservedBlock || (input.blockNumber === checkpoint.lastObservedBlock && input.blockHash !== checkpoint.lastObservedBlockHash)));
  const reorgDetected = Boolean(checkpoint && (
    targetHistoryUnavailable ||
    (trustedHeaderAtTarget !== undefined && !sameCanonicalHeader && input.blockNumber <= checkpoint.lastObservedBlock) ||
    (input.blockNumber === checkpoint.lastObservedBlock + 1n && input.parentBlockHash !== checkpoint.lastObservedBlockHash)
  ));
  const replayTargets = checkpoint ? pendingReplayTargets(checkpoint) : [];
  const replacementForPendingReplay = Boolean(checkpoint?.replayStatus === "REPLAY_REQUIRED" && replayTargets.some((target) => target.blockNumber === input.blockNumber));
  if (replacementForPendingReplay) {
    observations.set(input.observationId, { ...input, finalityState: "FINALITY_PENDING", projectionReference: `reorg:candidate:${input.observationId}` });
    const provenance = attachKnownEvidence(state, observations, observations.get(input.observationId)!);
    return clone(state, { observations, blockHistory, provenance });
  }
  const laterObservationDuringPendingReplay = Boolean(checkpoint?.replayStatus === "REPLAY_REQUIRED" && replayTargets.length > 0 && input.blockNumber > replayTargets[0]!.blockNumber);
  if (laterObservationDuringPendingReplay) {
    observations.set(input.observationId, { ...input, finalityState: "FINALITY_PENDING", projectionReference: `reorg:candidate:${input.observationId}` });
    const provenance = attachKnownEvidence(state, observations, observations.get(input.observationId)!);
    return clone(state, { observations, blockHistory, provenance });
  }
  if (reorgDetected) {
    const targets = replayTargetsFromState(state, input.chainKey, input.blockNumber);
    const replayOldBlockHash = targets[0]?.oldBlockHash ?? null;
    const missingHistory = targets.some((target) => target.oldBlockHash === null);
    for (const [id, item] of observations) if (item.chainKey === input.chainKey && item.blockNumber >= input.blockNumber) observations.set(id, { ...item, finalityState: "REORGED", projectionReference: `reorg:superseded:${id}` });
    observations.set(input.observationId, { ...input, finalityState: "FINALITY_PENDING", projectionReference: `reorg:candidate:${input.observationId}` });
    const affected = [...observations.values()].filter((item) => item.chainKey === input.chainKey && item.blockNumber >= input.blockNumber);
    const dependencyState = invalidateReorgDependencies(state, affected);
    const provenance = attachKnownEvidence(dependencyState, observations, observations.get(input.observationId)!);
    const checkpoints = new Map(dependencyState.checkpoints);
    checkpoints.set(input.chainKey, checkpointFromPrevious(input.chainKey, checkpoint, {
      ...replayCheckpointOverrides(targets, missingHistory ? "trusted canonical block history is unavailable" : "additional replacement observations required for affected indexed range", missingHistory ? "backfill trusted canonical headers before replay" : "submit a finalized replacement for the next affected indexed block"),
      replayOldBlockHash,
      replayParentBlockHash: targets[0]?.expectedParentBlockHash ?? null,
      updatedAt: input.observedAt,
    }));
    return clone(dependencyState, { observations, checkpoints, blockHistory, provenance });
  }
  observations.set(input.observationId, input);
  const provenance = attachKnownEvidence(state, observations, observations.get(input.observationId)!);
  return clone(state, { observations, blockHistory, provenance });
}

export function backfillReplayHeader(state: SliceBState, source: ObservationEnvelope): SliceBState {
  try { validateObservation(source); } catch (error) {
    const reason = error instanceof SliceBValidationError ? error.reason : "invalid replay backfill observation";
    return markDeadLetter(state, `backfill:${typeof source.observationId === "string" ? source.observationId : "invalid"}`, typeof source.relationshipId === "string" ? source.relationshipId : null, reason, "projection operator", "supply the exact indexed old observation", "REPLAY");
  }
  const checkpoint = state.checkpoints.get(source.chainKey);
  const indexed = state.observations.get(source.observationId);
  const targets = checkpoint ? pendingReplayTargets(checkpoint) : [];
  const target = targets[0];
  if (!checkpoint || checkpoint.replayStatus !== "REPLAY_REQUIRED" || !target || target.blockNumber !== source.blockNumber || target.oldBlockHash !== null || !indexed || !sameReplayIdentity(indexed, source)) return markDeadLetter(state, `backfill:${source.observationId}`, source.relationshipId, "replay backfill does not match the next missing target", "projection operator", "inspect replay target and supply the exact indexed old observation", "REPLAY");
  if (checkpoint.chainId !== source.chainId || checkpoint.sourceDomain !== source.sourceDomain || checkpoint.adapterVersion !== source.adapterVersion || checkpoint.observationSchemaVersion !== source.payloadSchemaVersion) return markDeadLetter(state, `backfill:${source.observationId}`, source.relationshipId, "replay backfill metadata does not match checkpoint", "projection operator", "backfill from the established chain metadata profile", "REPLAY");
  const nextTarget = { ...target, oldBlockHash: source.blockHash, oldParentBlockHash: source.parentBlockHash, expectedParentBlockHash: target.expectedParentBlockHash ?? source.parentBlockHash };
  const replayTargets = [nextTarget, ...targets.slice(1)];
  const blockHistory = upsertBlockHeader(state.blockHistory, source, "CANONICAL");
  const checkpoints = new Map(state.checkpoints);
  checkpoints.set(source.chainKey, checkpointFromPrevious(source.chainKey, checkpoint, { ...replayCheckpointOverrides(replayTargets, "additional replacement observations required for affected indexed range", "submit a finalized replacement for the next affected indexed block"), updatedAt: source.observedAt }));
  return clone(state, { checkpoints, blockHistory });
}

export function advanceFinality(state: SliceBState, chainKey: number, finalizedBlock: bigint, observedAt = Date.now()): SliceBState {
  try { requireFiniteNumber(chainKey, "chainKey", true); requireBigInt(finalizedBlock, "finalizedBlock"); requireFiniteNumber(observedAt, "observedAt"); } catch (error) {
    const reason = error instanceof SliceBValidationError ? error.reason : "invalid finality input";
    return markDeadLetter(state, `finality:${String(chainKey)}:${String(finalizedBlock)}`, null, reason, "finality operator", "supply a finite nonnegative finality value", "FINALITY");
  }
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
    if (item.chainKey !== chainKey || item.finalityState === "REORGED" || ["CONFLICTING", "MALFORMED", "REJECTED", "UNAVAILABLE"].includes(item.observationState)) continue;
    const header = blockHistory.get(blockKey(item.chainKey, item.blockNumber, item.blockHash));
    const isCanonical = header?.status === "CANONICAL";
    if (isCanonical && (!latestObserved || item.blockNumber > latestObserved.item.blockNumber || (item.blockNumber === latestObserved.item.blockNumber && id.localeCompare(latestObserved.id) > 0))) latestObserved = { item, id };
    if (item.blockNumber <= effectiveFinalizedBlock) {
      const finalized = item.finalityState === "FINALIZED" ? item : { ...item, finalityState: "FINALIZED" as const, updatedAt: observedAt };
      if (finalized !== item) { observations.set(id, finalized); changed = true; }
      if (isCanonical && (!latestFinalized || item.blockNumber > latestFinalized.item.blockNumber || (item.blockNumber === latestFinalized.item.blockNumber && id.localeCompare(latestFinalized.id) > 0))) latestFinalized = { item: finalized, id };
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
    replayReason: replayRequired ? previous!.replayReason : null,
  });
  if (previous && stableJson(previous) === stableJson(checkpoint) && !changed) return state;
  checkpoints.set(chainKey, checkpoint);
  return clone(state, { observations, checkpoints, blockHistory });
}

function replayBaseId(chainKey: number, fromBlock: bigint, observationIdValue: string, blockHash: string): string {
  return `replay:${hash(String(chainKey), String(fromBlock), observationIdValue, blockHash)}`;
}

function blockedReplay(state: SliceBState, checkpoint: Checkpoint | undefined, replacement: ObservationEnvelope, reason: string, observedAt: number, sequence: number, relationshipId: string | null, finalizedBlock: bigint = 0n): ReplayResult {
  const chainKey = Number.isSafeInteger(replacement.chainKey) ? replacement.chainKey : -1;
  const fromBlock = typeof replacement.blockNumber === "bigint" && replacement.blockNumber >= 0n ? checkpoint?.replayFromBlock ?? replacement.blockNumber : 0n;
  const observationValue = typeof replacement.observationId === "string" ? replacement.observationId : "invalid";
  const blockHash = typeof replacement.blockHash === "string" ? replacement.blockHash : "";
  const baseId = replayBaseId(chainKey, fromBlock, observationValue, blockHash);
  const id = `${baseId}:blocked:${hash(reason)}`;
  const existing = state.replayHistory.find((attempt) => attempt.id === id);
  if (existing) return { outcome: "BLOCKED", state, attempt: existing };
  const attempt: ReplayAttempt = { id, relationshipId, chainKey, fromBlock, replacementObservationId: observationValue, oldBlockHash: checkpoint?.replayOldBlockHash ?? "", replacementBlockHash: blockHash, status: "BLOCKED", reason, recoveryRole: checkpoint?.replayRecoveryRole ?? "projection operator", observedAt, finalizedBlock, sequence };
  return { outcome: "BLOCKED", state: clone(state, { replayHistory: [...state.replayHistory, attempt] }), attempt };
}

export function replayReorg(state: SliceBState, replacement: ObservationEnvelope, options: ReplayOptions): ReplayResult {
  const rawFinalizedBlock = options?.finalizedBlock;
  const rawObservedAt = options?.observedAt ?? replacement?.observedAt;
  const finalizedBlock = typeof rawFinalizedBlock === "bigint" ? rawFinalizedBlock : -1n;
  const observedAt = typeof rawObservedAt === "number" && Number.isFinite(rawObservedAt) && rawObservedAt >= 0 ? rawObservedAt : 0;
  let commandError: string | null = null;
  try {
    validateObservation(replacement);
    requireBigInt(finalizedBlock, "finalizedBlock");
    requireFiniteNumber(observedAt, "observedAt");
  } catch (error) {
    commandError = error instanceof SliceBValidationError ? error.reason : "invalid replay command";
  }
  const preliminaryCheckpoint = typeof replacement?.chainKey === "number" ? state.checkpoints.get(replacement.chainKey) : undefined;
  const sequence = (preliminaryCheckpoint?.replaySequence ?? 0) + 1;
  if (commandError) return blockedReplay(state, preliminaryCheckpoint, replacement, commandError, observedAt, sequence, typeof replacement?.relationshipId === "string" ? replacement.relationshipId : null, finalizedBlock);

  const checkpoint = state.checkpoints.get(replacement.chainKey);
  const indexedReplacement = state.observations.get(replacement.observationId);
  const exactPrior = state.replayHistory.find((attempt) => attempt.status === "SUCCEEDED" && attempt.chainKey === replacement.chainKey && attempt.fromBlock === replacement.blockNumber && attempt.replacementObservationId === replacement.observationId && attempt.replacementBlockHash === replacement.blockHash && attempt.finalizedBlock === finalizedBlock);
  if (indexedReplacement && !sameReplayIdentity(indexedReplacement, replacement)) return blockedReplay(state, checkpoint, replacement, "replacement identity conflicts with indexed observation", observedAt, sequence, indexedReplacement.relationshipId ?? null, finalizedBlock);
  if (exactPrior) return { outcome: "NOOP", state, attempt: exactPrior };
  if (!checkpoint || checkpoint.replayStatus !== "REPLAY_REQUIRED") return blockedReplay(state, checkpoint, replacement, "checkpoint is not replay-required", observedAt, sequence, replacement.relationshipId ?? null, finalizedBlock);
  if (!indexedReplacement) return blockedReplay(state, checkpoint, replacement, "replacement is not indexed", observedAt, sequence, replacement.relationshipId ?? null, finalizedBlock);

  const targets = pendingReplayTargets(checkpoint);
  const target = targets[0];
  if (!target) return blockedReplay(state, checkpoint, replacement, "replay target is unavailable", observedAt, sequence, indexedReplacement.relationshipId ?? null, finalizedBlock);
  const trustedHeader = target.oldBlockHash === null ? undefined : canonicalHeaderFor(state, replacement.chainKey, target.blockNumber, target.oldBlockHash);
  const oldObservation = trustedHeader ? state.observations.get(trustedHeader.observationId) : undefined;
  let reason: string | null = null;
  if (indexedReplacement.blockNumber !== target.blockNumber) reason = "replacement block does not match next replay target";
  else if (checkpoint.replayFromBlock !== target.blockNumber || checkpoint.replayOldBlockHash !== target.oldBlockHash || checkpoint.replayParentBlockHash !== target.expectedParentBlockHash) reason = "checkpoint replay target identity does not match replay range";
  else if (target.oldBlockHash === null) reason = "trusted canonical block history is unavailable";
  else if (!trustedHeader) reason = "trusted canonical block header is unavailable";
  else if (trustedHeader.chainKey !== replacement.chainKey || trustedHeader.blockNumber !== target.blockNumber || trustedHeader.blockHash !== target.oldBlockHash || trustedHeader.chainId !== checkpoint.chainId || trustedHeader.sourceDomain !== checkpoint.sourceDomain || trustedHeader.adapterVersion !== checkpoint.adapterVersion || trustedHeader.payloadSchemaVersion !== checkpoint.observationSchemaVersion) reason = "trusted canonical header metadata does not match checkpoint";
  else if (target.oldParentBlockHash !== trustedHeader.parentBlockHash) reason = "trusted predecessor continuity does not match replay range";
  else if (indexedReplacement.parentBlockHash !== target.expectedParentBlockHash) reason = "replacement parent does not match selected predecessor";
  else if (checkpoint.chainId !== indexedReplacement.chainId || checkpoint.sourceDomain !== indexedReplacement.sourceDomain || checkpoint.adapterVersion !== indexedReplacement.adapterVersion || checkpoint.observationSchemaVersion !== indexedReplacement.payloadSchemaVersion) reason = "replacement metadata does not match checkpoint";
  else if (indexedReplacement.finalityState !== "FINALIZED" || finalizedBlock < indexedReplacement.blockNumber) reason = "replacement has not reached finality";
  else if (["CONFLICTING", "MALFORMED", "REJECTED", "UNAVAILABLE"].includes(indexedReplacement.observationState)) reason = "replacement observation is not eligible";
  else if (indexedReplacement.blockHash === target.oldBlockHash) reason = "replacement block hash is not a replacement";
  if (reason) return blockedReplay(state, checkpoint, replacement, reason, observedAt, sequence, indexedReplacement.relationshipId ?? null, finalizedBlock);

  const effectiveReplayFinality = checkpoint.lastFinalizedBlock !== null && checkpoint.lastFinalizedBlock > finalizedBlock ? checkpoint.lastFinalizedBlock : finalizedBlock;
  const affectedForDependencies = [...state.observations.values()].filter((item) => item.chainKey === replacement.chainKey && item.blockNumber === target.blockNumber && item.blockHash === target.oldBlockHash);
  const dependencyState = invalidateReorgDependencies(state, affectedForDependencies);
  const observations = new Map(dependencyState.observations);
  for (const [id, item] of observations) if (item.chainKey === replacement.chainKey && item.blockNumber === target.blockNumber && item.blockHash === target.oldBlockHash && id !== indexedReplacement.observationId) observations.set(id, { ...item, finalityState: "REORGED", projectionReference: `replay:superseded:${indexedReplacement.observationId}` });
  observations.set(indexedReplacement.observationId, { ...indexedReplacement, finalityState: "FINALIZED", projectionReference: `replay:current:${indexedReplacement.observationId}`, updatedAt: observedAt });

  const blockHistory = new Map(state.blockHistory);
  for (const [key, header] of blockHistory) if (header.chainKey === replacement.chainKey && header.blockNumber === target.blockNumber) blockHistory.set(key, { ...header, status: header.blockHash === indexedReplacement.blockHash ? "CANONICAL" : "SUPERSEDED" });

  let remainingTargets = targets.slice(1);
  if (remainingTargets.length > 0) remainingTargets = [{ ...remainingTargets[0]!, expectedParentBlockHash: indexedReplacement.blockHash }, ...remainingTargets.slice(1)];
  const missingNextHistory = remainingTargets.some((item) => item.oldBlockHash === null);
  const checkpointTipIsTarget = checkpoint.lastObservedBlock === target.blockNumber;
  const nextLastObservedBlock = checkpoint.lastObservedBlock > target.blockNumber ? checkpoint.lastObservedBlock : target.blockNumber;
  const nextLastObservedBlockHash = checkpoint.lastObservedBlock > target.blockNumber ? checkpoint.lastObservedBlockHash : indexedReplacement.blockHash;
  const checkpoints = new Map(dependencyState.checkpoints);
  checkpoints.set(replacement.chainKey, checkpointFromPrevious(replacement.chainKey, checkpoint, {
    sourceDomain: indexedReplacement.sourceDomain,
    chainId: indexedReplacement.chainId,
    lastObservedBlock: checkpointTipIsTarget || checkpoint.lastObservedBlock <= target.blockNumber ? nextLastObservedBlock : checkpoint.lastObservedBlock,
    lastObservedBlockHash: checkpointTipIsTarget || checkpoint.lastObservedBlock <= target.blockNumber ? nextLastObservedBlockHash : checkpoint.lastObservedBlockHash,
    lastFinalizedBlock: effectiveReplayFinality,
    adapterVersion: indexedReplacement.adapterVersion,
    observationSchemaVersion: indexedReplacement.payloadSchemaVersion,
    ...replayCheckpointOverrides(remainingTargets, missingNextHistory ? "trusted canonical block history is unavailable" : "additional replacement observations required for affected indexed range", missingNextHistory ? "backfill trusted canonical headers before replay" : "submit a finalized replacement for the next affected indexed block"),
    replaySequence: sequence,
    updatedAt: observedAt,
  }));
  const provenance = oldObservation ? addProvenance(dependencyState, { id: `provenance:${hash(indexedReplacement.observationId, oldObservation.observationId)}`, childId: indexedReplacement.observationId, parentId: oldObservation.observationId, relation: "REPLAYED_FROM", authority: "projection", evidenceId: null }) : dependencyState.provenance;
  const baseId = replayBaseId(replacement.chainKey, target.blockNumber, indexedReplacement.observationId, indexedReplacement.blockHash);
  const attempt: ReplayAttempt = { id: baseId, relationshipId: indexedReplacement.relationshipId ?? null, chainKey: replacement.chainKey, fromBlock: target.blockNumber, replacementObservationId: indexedReplacement.observationId, oldBlockHash: target.oldBlockHash ?? "", replacementBlockHash: indexedReplacement.blockHash, status: "SUCCEEDED", reason: remainingTargets.length > 0 ? "replacement finalized and replayed; additional replacement observations required for affected indexed range" : "replacement finalized and replayed", recoveryRole: "projection operator", observedAt, finalizedBlock, sequence };
  return { outcome: "REPLAYED", state: clone(dependencyState, { observations, checkpoints, blockHistory, provenance, replayHistory: [...dependencyState.replayHistory, attempt] }), attempt };
}

export function recordEvidence(state: SliceBState, evidence: EvidenceRecord): SliceBState {
  const matchingObservation = [...state.observations.values()].find((item) => item.sourceEventId === evidence.sourceEventId && (evidence.relationshipId === null || evidence.relationshipId === item.relationshipId));
  if (matchingObservation) evidence = { ...evidence, chainId: evidence.chainId ?? matchingObservation.chainId, eventIndex: evidence.eventIndex ?? matchingObservation.eventIndex, blockHash: evidence.blockHash ?? matchingObservation.blockHash };
  try { validateEvidence(evidence); } catch (error) {
    const reason = error instanceof SliceBValidationError ? error.reason : "invalid evidence record";
    return markDeadLetter(state, `evidence:${typeof evidence.evidenceId === "string" ? evidence.evidenceId : "invalid"}`, evidence.relationshipId ?? null, reason, "evidence operator", "repair evidence identity and retry", "EVIDENCE");
  }
  const existing = state.evidence.get(evidence.evidenceId);
  if (existing) {
    if (stableJson(existing) === stableJson(evidence)) return state;
    const conflictId = `evidence-conflict:${hash(evidence.evidenceId, stableJson(evidence))}`;
    if (state.evidenceConflicts.some((conflict) => conflict.id === conflictId)) return state;
    const observations = new Map(state.observations);
    for (const [id, item] of observations) if (item.sourceEventId === evidence.sourceEventId) observations.set(id, { ...item, observationState: "CONFLICTING" });
    const conflict: EvidenceConflict = { id: conflictId, relationshipId: evidence.relationshipId, evidenceId: evidence.evidenceId, existingRelationshipId: existing.relationshipId, conflictingRelationshipId: evidence.relationshipId, existingSourceEventId: existing.sourceEventId, conflictingSourceEventId: evidence.sourceEventId, existingContentHash: hash(stableJson(existing)), conflictingContentHash: hash(stableJson(evidence)), existingContent: existing, conflictingContent: evidence, reason: "same globally unique evidence ID has conflicting content" };
    const evidenceConflicts = [...state.evidenceConflicts, conflict].sort((left, right) => left.id.localeCompare(right.id));
    return clone(state, { evidenceConflicts, observations });
  }
  const records = new Map(state.evidence);
  records.set(evidence.evidenceId, evidence);
  const observations = new Map(state.observations);
  let linked = false;
  for (const [id, item] of observations) if (evidenceMatchesObservation(evidence, item)) { observations.set(id, { ...item, evidenceId: evidence.evidenceId }); linked = true; }
  const provenance = linked ? addProvenance(state, { id: `provenance:${hash(evidence.evidenceId, evidence.sourceEventId)}`, childId: evidence.sourceEventId, parentId: evidence.evidenceId, relation: "PROVEN_BY", authority: "attestcoin", evidenceId: evidence.evidenceId }) : state.provenance;
  const mismatch = [...state.observations.values()].some((item) => item.sourceEventId === evidence.sourceEventId && !evidenceMatchesObservation(evidence, item));
  const nextState = clone(state, { evidence: records, observations, provenance });
  return mismatch ? markDeadLetter(nextState, `evidence:${evidence.evidenceId}:identity-mismatch`, evidence.relationshipId, "evidence identity does not match observed source coordinates", "evidence operator", "provide evidence for the exact source event and block", "EVIDENCE") : nextState;
}

export function recordCanonical(state: SliceBState, reference: CanonicalReference): SliceBState {
  try { validateCanonical(reference); } catch (error) {
    const reason = error instanceof SliceBValidationError ? error.reason : "invalid canonical reference";
    return markDeadLetter(state, `canonical:${typeof reference.objectId === "string" ? reference.objectId : "invalid"}`, reference.relationshipId ?? null, reason, "canonical read operator", "repair canonical reference and retry", "CANONICAL");
  }
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

function reconciliationContent(record: ReconciliationRecord | ReconciliationInput): string {
  const { id: _id, sequence: _sequence, occurredAt: _occurredAt, ...content } = record as ReconciliationRecord;
  return stableJson(content);
}

export function reconcile(state: SliceBState, record: ReconciliationInput): SliceBState {
  try { validateReconciliation(record); } catch (error) {
    const reason = error instanceof SliceBValidationError ? error.reason : "invalid reconciliation record";
    return markDeadLetter(state, `reconciliation:${hash(stableJson(record))}`, record.relationshipId ?? null, reason, "reconciliation operator", "repair reconciliation input and retry", "RECONCILIATION") as SliceBState;
  }
  const scopeKey = reconciliationKey(record);
  const existing = state.reconciliations.get(scopeKey);
  if (existing && reconciliationContent(existing) === reconciliationContent(record)) return state;
  const nextSequence = (state.reconciliationHistory.filter((item) => reconciliationKey(item) === scopeKey).reduce((max, item) => Math.max(max, item.sequence), 0)) + 1;
  const value: ReconciliationRecord = { ...record, sequence: nextSequence, occurredAt: record.occurredAt ?? nextSequence, id: `reconciliation:${hash(scopeKey, stableJson({ ...record, sequence: nextSequence, occurredAt: record.occurredAt ?? nextSequence }))}` };
  const reconciliations = new Map(state.reconciliations);
  reconciliations.set(scopeKey, value);
  const historyValue: ReconciliationRecord = { ...value, id: `reconciliation-history:${hash(scopeKey, reconciliationContent(value), String(nextSequence))}` };
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
    const validity = item.finalityState === "REORGED" || ["CONFLICTING", "MALFORMED", "REJECTED", "UNAVAILABLE"].includes(item.observationState) ? "HISTORICAL_REORGED" : "CURRENT";
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
    reconciliationHistory: [...state.reconciliationHistory].sort((a, b) => reconciliationKey(a).localeCompare(reconciliationKey(b)) || a.sequence - b.sequence || a.occurredAt - b.occurredAt || a.id.localeCompare(b.id)),
    checkpoints: [...state.checkpoints.entries()].sort(([a], [b]) => a - b),
    blockHistory: [...state.blockHistory.entries()].sort(([a], [b]) => a.localeCompare(b)),
    replayHistory: [...state.replayHistory].sort((a, b) => a.id.localeCompare(b.id)),
    graphs: [...state.graphs.entries()].sort(([a], [b]) => a.localeCompare(b)),
    deadLetters: [...state.deadLetters].sort((a, b) => a.observationId.localeCompare(b.observationId) || (a.relationshipId ?? "").localeCompare(b.relationshipId ?? "") || a.reason.localeCompare(b.reason)),
  });
}

function restoreReplayTargets(checkpoint: Record<string, unknown>): readonly ReplayTarget[] {
  if (Array.isArray(checkpoint.replayTargets)) return checkpoint.replayTargets.map((target) => ({ chainKey: target.chainKey as number, blockNumber: snapshotBigInt(target.blockNumber), oldBlockHash: (target.oldBlockHash ?? null) as string | null, oldParentBlockHash: (target.oldParentBlockHash ?? null) as string | null, expectedParentBlockHash: (target.expectedParentBlockHash ?? target.oldParentBlockHash ?? null) as string | null }));
  const fromBlock = snapshotOptionalBigInt(checkpoint.replayFromBlock);
  if (checkpoint.replayStatus === "REPLAY_REQUIRED" && fromBlock !== null) return [{ chainKey: checkpoint.chainKey as number, blockNumber: fromBlock, oldBlockHash: (checkpoint.replayOldBlockHash ?? null) as string | null, oldParentBlockHash: (checkpoint.replayParentBlockHash ?? null) as string | null, expectedParentBlockHash: (checkpoint.replayParentBlockHash ?? null) as string | null }];
  return [];
}

function validateRestoredStateParts(observations: ReadonlyMap<string, ObservationEnvelope>, evidence: ReadonlyMap<string, EvidenceRecord>, canonical: ReadonlyMap<string, CanonicalReference>, reconciliations: ReadonlyMap<string, ReconciliationRecord>, reconciliationHistory: readonly ReconciliationRecord[], checkpoints: ReadonlyMap<number, Checkpoint>, blockHistory: ReadonlyMap<string, BlockHeader>, replayHistory: readonly ReplayAttempt[], evidenceConflicts: readonly EvidenceConflict[], deadLetters: readonly DeadLetterRecord[]): void {
  try {
    for (const item of observations.values()) validateObservation(item);
    for (const item of evidence.values()) validateEvidence(item);
    for (const item of canonical.values()) validateCanonical(item);
    for (const item of reconciliations.values()) validateReconciliation(item);
    for (const item of reconciliationHistory) { validateReconciliation(item); requireFiniteNumber(item.sequence, "reconciliation.sequence", true); requireFiniteNumber(item.occurredAt, "reconciliation.occurredAt"); }
    const canonicalHeights = new Set<string>();
    for (const header of blockHistory.values()) {
      requireFiniteNumber(header.chainKey, "blockHeader.chainKey", true);
      requireFiniteNumber(header.chainId, "blockHeader.chainId", true, true);
      requireString(header.sourceDomain, "blockHeader.sourceDomain"); requireBigInt(header.blockNumber, "blockHeader.blockNumber"); requireString(header.blockHash, "blockHeader.blockHash"); requireNullableString(header.parentBlockHash, "blockHeader.parentBlockHash"); requireString(header.adapterVersion, "blockHeader.adapterVersion"); requireString(header.payloadSchemaVersion, "blockHeader.payloadSchemaVersion"); requireString(header.observationId, "blockHeader.observationId"); requireEnum(header.status, new Set(["CANDIDATE", "CANONICAL", "SUPERSEDED"] as const), "blockHeader.status");
      if (header.status === "CANONICAL") { const height = `${header.chainKey}:${header.blockNumber}`; if (canonicalHeights.has(height)) throw new SliceBValidationError("more than one canonical block header exists at one chain height"); canonicalHeights.add(height); }
    }
    for (const checkpoint of checkpoints.values()) { requireFiniteNumber(checkpoint.chainKey, "checkpoint.chainKey", true); requireBigInt(checkpoint.lastObservedBlock, "checkpoint.lastObservedBlock"); requireNullableString(checkpoint.lastObservedBlockHash, "checkpoint.lastObservedBlockHash"); requireNullableString(checkpoint.replayReason, "checkpoint.replayReason"); requireNullableString(checkpoint.replayOwner, "checkpoint.replayOwner"); requireNullableString(checkpoint.replayRecoveryRole, "checkpoint.replayRecoveryRole"); requireNullableString(checkpoint.replayNextAction, "checkpoint.replayNextAction"); requireEnum(checkpoint.replayStatus, new Set(["CURRENT", "REPLAY_REQUIRED"] as const), "checkpoint.replayStatus"); for (const target of checkpoint.replayTargets) { requireFiniteNumber(target.chainKey, "replayTarget.chainKey", true); requireBigInt(target.blockNumber, "replayTarget.blockNumber"); requireNullableString(target.oldBlockHash, "replayTarget.oldBlockHash"); requireNullableString(target.oldParentBlockHash, "replayTarget.oldParentBlockHash"); requireNullableString(target.expectedParentBlockHash, "replayTarget.expectedParentBlockHash"); } }
    for (const attempt of replayHistory) { requireString(attempt.id, "replay.id"); requireFiniteNumber(attempt.chainKey, "replay.chainKey", true); requireBigInt(attempt.fromBlock, "replay.fromBlock"); requireString(attempt.replacementObservationId, "replay.replacementObservationId"); requireString(attempt.oldBlockHash, "replay.oldBlockHash", true); requireString(attempt.replacementBlockHash, "replay.replacementBlockHash"); requireEnum(attempt.status, new Set(["SUCCEEDED", "BLOCKED"] as const), "replay.status"); requireString(attempt.reason, "replay.reason"); requireString(attempt.recoveryRole, "replay.recoveryRole"); requireFiniteNumber(attempt.observedAt, "replay.observedAt"); requireBigInt(attempt.finalizedBlock, "replay.finalizedBlock"); requireFiniteNumber(attempt.sequence, "replay.sequence", true); }
    for (const conflict of evidenceConflicts) { requireString(conflict.id, "evidenceConflict.id"); requireString(conflict.evidenceId, "evidenceConflict.evidenceId"); requireString(conflict.existingContentHash, "evidenceConflict.existingContentHash"); requireString(conflict.conflictingContentHash, "evidenceConflict.conflictingContentHash"); requireString(conflict.reason, "evidenceConflict.reason"); if (conflict.existingContent) validateEvidence(conflict.existingContent); if (conflict.conflictingContent) validateEvidence(conflict.conflictingContent); }
    for (const deadLetter of deadLetters) { requireString(deadLetter.observationId, "deadLetter.observationId"); requireNullableString(deadLetter.relationshipId, "deadLetter.relationshipId"); requireString(deadLetter.reason, "deadLetter.reason"); requireString(deadLetter.recoveryRole, "deadLetter.recoveryRole"); requireString(deadLetter.nextAction, "deadLetter.nextAction"); requireEnum(deadLetter.kind, new Set(["OBSERVATION", "EVIDENCE", "CANONICAL", "RECONCILIATION", "FINALITY", "REPLAY", "SNAPSHOT"] as const), "deadLetter.kind"); }
  } catch (error) {
    if (error instanceof SliceBValidationError) throw new Error(`INVALID_SNAPSHOT_RECORD: ${error.reason}`);
    throw error;
  }
}

function assertSafeSnapshotValue(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) throw new Error("CYCLIC_SNAPSHOT");
  if (Object.getPrototypeOf(value) !== Object.prototype && !Array.isArray(value)) throw new Error("UNSAFE_SNAPSHOT_PROTOTYPE");
  seen.add(value);
  if (Array.isArray(value)) for (const item of value) assertSafeSnapshotValue(item, seen);
  else for (const key of Object.keys(value)) { if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error("UNSAFE_SNAPSHOT_KEY"); assertSafeSnapshotValue((value as Record<string, unknown>)[key], seen); }
  seen.delete(value);
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
  assertSafeSnapshotValue(parsed);
  if (parsed.schemaVersion !== "slice-b-read-model-v1") throw new Error("UNSUPPORTED_SNAPSHOT_SCHEMA");
  const observations = new Map((parsed.observations ?? []).map(([key, item]) => [key, { ...item, blockNumber: snapshotBigInt(item.blockNumber) } as ObservationEnvelope] as [string, ObservationEnvelope]));
  const evidence = new Map((parsed.evidence ?? []).map(([key, item]) => [key, { ...item, blockNumber: snapshotBigInt(item.blockNumber) } as EvidenceRecord] as [string, EvidenceRecord]));
  const checkpoints = new Map((parsed.checkpoints ?? []).map(([key, checkpoint]) => [key, { ...checkpoint, lastObservedBlock: snapshotBigInt(checkpoint.lastObservedBlock), lastFinalizedBlock: snapshotOptionalBigInt(checkpoint.lastFinalizedBlock), cursorMode: checkpoint.cursorMode ?? "SPARSE_EVENT", replayStatus: checkpoint.replayStatus ?? "CURRENT", replayReason: checkpoint.replayReason ?? null, replayOwner: checkpoint.replayOwner ?? null, replayRecoveryRole: checkpoint.replayRecoveryRole ?? null, replayNextAction: checkpoint.replayNextAction ?? null, replayTargets: restoreReplayTargets(checkpoint), replayParentBlockHash: checkpoint.replayParentBlockHash ?? null, replayOldBlockHash: checkpoint.replayOldBlockHash ?? null, replayFromBlock: snapshotOptionalBigInt(checkpoint.replayFromBlock), replaySequence: checkpoint.replaySequence ?? 0 } as unknown as Checkpoint] as [number, Checkpoint]));
  const replayHistory = (parsed.replayHistory ?? []).map((attempt) => ({ ...attempt, fromBlock: snapshotBigInt(attempt.fromBlock), finalizedBlock: snapshotOptionalBigInt(attempt.finalizedBlock) ?? 0n, relationshipId: attempt.relationshipId ?? null } as unknown as ReplayAttempt));
  const deadLetters = (parsed.deadLetters ?? []).map((item) => ({ ...item, relationshipId: item.relationshipId ?? null, nextAction: item.nextAction ?? "repair input and retry", kind: item.kind ?? "OBSERVATION" } as unknown as DeadLetterRecord));
  const reconciliationRecords = (parsed.reconciliations ?? []).map(([key, record]) => [key, { ...record, sequence: record.sequence ?? 1, occurredAt: record.occurredAt ?? record.sequence ?? 1 }] as [string, ReconciliationRecord]);
  const reconciliations = new Map(reconciliationRecords.map(([, record]) => [reconciliationKey(record), record] as [string, ReconciliationRecord]));
  const reconciliationHistory = parsed.reconciliationHistory ? parsed.reconciliationHistory.map((record, index) => ({ ...record, sequence: record.sequence ?? index + 1, occurredAt: record.occurredAt ?? record.sequence ?? index + 1 })) : reconciliationRecords.map(([, record]) => {
    const scopeKey = reconciliationKey(record);
    return { ...record, id: `reconciliation-history:${hash(scopeKey, reconciliationContent(record), String(record.sequence))}` };
  });
  const canonical = new Map((parsed.canonical ?? []).map(([, reference]) => [canonicalKey(reference.relationshipId, reference.objectId), { ...reference, blockNumber: snapshotOptionalBigInt(reference.blockNumber) } as CanonicalReference] as [string, CanonicalReference]));
  const blockHistory = new Map((parsed.blockHistory ?? []).map(([, header]) => [blockKey(header.chainKey, snapshotBigInt(header.blockNumber), header.blockHash), { ...header, blockNumber: snapshotBigInt(header.blockNumber) } as BlockHeader] as [string, BlockHeader]));
  const evidenceConflicts = (parsed.evidenceConflicts ?? []).map((conflict) => ({ ...conflict, existingContent: conflict.existingContent ? { ...conflict.existingContent, blockNumber: snapshotBigInt(conflict.existingContent.blockNumber) } : undefined, conflictingContent: conflict.conflictingContent ? { ...conflict.conflictingContent, blockNumber: snapshotBigInt(conflict.conflictingContent.blockNumber) } : undefined })) as EvidenceConflict[];
  validateRestoredStateParts(observations, evidence, canonical, reconciliations, reconciliationHistory, checkpoints, blockHistory, replayHistory, evidenceConflicts, deadLetters);
  return { schemaVersion: parsed.schemaVersion, observations, evidence, evidenceConflicts, canonical, provenance: parsed.provenance ?? [], reconciliations, reconciliationHistory, checkpoints, blockHistory, replayHistory, graphs: new Map(parsed.graphs ?? []), deadLetters };
}

export function snapshotHash(state: SliceBState): string { return hash(snapshot(state)); }
