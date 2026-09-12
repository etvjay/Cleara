import { buildRelationshipGraph, snapshot, snapshotHash, type Checkpoint, type EvidenceRecord, type ObjectType, type ReconciliationRecord, type SliceBState } from "./slice-b.js";

export interface ReconciliationRead {
  readonly current: readonly ReconciliationRecord[];
  readonly history: readonly ReconciliationRecord[];
}

export interface SerializedSliceBSnapshot {
  readonly hash: string;
  readonly body: string;
}

export interface SliceBApi {
  health(): { readonly status: "ok"; readonly readOnly: true; readonly schemaVersion: string };
  checkpoint(chainKey: number): Checkpoint | null;
  relationship(id: string): unknown;
  object(id: string, relationshipId?: string, expectedType?: ObjectType): unknown | null;
  evidence(id: string, relationshipId?: string): EvidenceRecord | null;
  timeline(id: string): unknown[];
  graph(id: string): unknown;
  investigations(relationshipId?: string): unknown[];
  reconciliation(relationshipId: string): ReconciliationRead;
  checkpoints(): readonly Checkpoint[];
  snapshot(): SerializedSliceBSnapshot;
  serializeSnapshot(): SerializedSliceBSnapshot;
}

function belongsToRelationship(_state: SliceBState, relationshipId: string, evidence: EvidenceRecord): boolean {
  return evidence.relationshipId === relationshipId;
}

function stableKey(value: unknown): string {
  return JSON.stringify(value, (_, current) => typeof current === "bigint" ? `${current}n` : current) ?? "";
}
function sortedRecords<T>(records: readonly T[]): T[] {
  return [...records].sort((left, right) => stableKey(left).localeCompare(stableKey(right)));
}
function scopedObject(state: SliceBState, id: string, relationshipId?: string, expectedType?: ObjectType): unknown | null {
  const observations = sortedRecords([...state.observations.values()].filter((item) => item.objectId === id && (relationshipId === undefined || item.relationshipId === relationshipId) && (expectedType === undefined || item.objectType === expectedType)));
  const canonical = sortedRecords([...state.canonical.values()].filter((item) => item.objectId === id && (relationshipId === undefined || item.relationshipId === relationshipId)));
  const reconciliations = sortedRecords([...state.reconciliations.values()].filter((item) => item.canonicalObjectId === id && (relationshipId === undefined || item.relationshipId === relationshipId)));
  const evidenceRecord = state.evidence.get(id);
  const scopedRelationships = new Set<string>([
    ...observations.map((item) => item.relationshipId),
    ...canonical.flatMap((item) => item.relationshipId === null ? [] : [item.relationshipId]),
    ...reconciliations.map((item) => item.relationshipId),
  ]);
  const evidence = evidenceRecord && (relationshipId === undefined ? (evidenceRecord.relationshipId !== null || scopedRelationships.size === 0) : evidenceRecord.relationshipId === relationshipId) ? evidenceRecord : undefined;
  const relationships = new Set<string>([...scopedRelationships, ...(evidence?.relationshipId ? [evidence.relationshipId] : [])]);
  if (relationshipId === undefined && relationships.size > 1) return { error: "AMBIGUOUS_OBJECT_SCOPE", objectId: id, relationships: [...relationships].sort() };
  if (!observations.length && !canonical.length && !reconciliations.length && !evidence) return null;
  return { id, relationshipId: relationshipId ?? (relationships.size === 1 ? [...relationships][0] : null), source: "projection", canonical: false, observations, canonicalReference: canonical.length === 1 ? canonical[0] : canonical, reconciliations, evidence, evidenceMode: "local_projection" };
}

/** Read-only API boundary. It exposes projection records without granting authority. */
export function createSliceBApi(state: SliceBState): SliceBApi {
  return {
    health: () => ({ status: "ok", readOnly: true, schemaVersion: state.schemaVersion }),
    checkpoint: (chainKey) => Number.isSafeInteger(chainKey) && chainKey >= 0 ? state.checkpoints.get(chainKey) ?? null : null,
    evidence: (id, relationshipId) => {
      const record = typeof id === "string" ? state.evidence.get(id) : undefined;
      if (!record) return null;
      if (relationshipId !== undefined && record.relationshipId !== relationshipId) return null;
      return record;
    },
    object: (id, relationshipId, expectedType) => scopedObject(state, id, relationshipId, expectedType),
    relationship: (id) => ({
      relationshipId: id,
      source: "projection",
      canonical: false,
      observations: sortedRecords([...state.observations.values()].filter((item) => item.relationshipId === id)),
      evidence: sortedRecords([...state.evidence.values()].filter((item) => belongsToRelationship(state, id, item))),
      canonicalState: sortedRecords([...state.canonical.values()].filter((item) => item.relationshipId === id)),
      reconciliations: sortedRecords([...state.reconciliations.values()].filter((item) => item.relationshipId === id)),
      reconciliationHistory: [...state.reconciliationHistory].filter((item) => item.relationshipId === id).sort((left, right) => left.sequence - right.sequence || left.occurredAt - right.occurredAt),
      graph: buildRelationshipGraph(state, id),
      evidenceMode: "local_projection",
    }),
    timeline: (id) => [...state.observations.values()].filter((item) => item.relationshipId === id).sort((a, b) => a.blockNumber < b.blockNumber ? -1 : a.blockNumber > b.blockNumber ? 1 : a.eventIndex - b.eventIndex || a.observationId.localeCompare(b.observationId)),
    graph: (id) => buildRelationshipGraph(state, id),
    investigations: (relationshipId) => sortedRecords([
      ...[...state.reconciliations.values()].filter((item) => item.state !== "RECONCILED" && (relationshipId === undefined || item.relationshipId === relationshipId)),
      ...state.evidenceConflicts.filter((item) => relationshipId === undefined || item.relationshipId === relationshipId || item.existingRelationshipId === relationshipId),
      ...state.deadLetters.filter((item) => relationshipId === undefined || item.relationshipId === relationshipId),
      ...state.replayHistory.filter((attempt) => attempt.status === "BLOCKED" && (relationshipId === undefined || attempt.relationshipId === relationshipId)),
      ...[...state.observations.values()].filter((item) => (item.finalityState === "REORGED" || item.observationState === "CONFLICTING" || item.observationState === "MALFORMED" || item.observationState === "REJECTED") && (relationshipId === undefined || item.relationshipId === relationshipId)),
    ]),
    reconciliation: (relationshipId) => ({
      current: sortedRecords([...state.reconciliations.values()].filter((item) => item.relationshipId === relationshipId)),
      history: [...state.reconciliationHistory].filter((item) => item.relationshipId === relationshipId).sort((left, right) => left.sequence - right.sequence || left.occurredAt - right.occurredAt || left.id.localeCompare(right.id)),
    }),
    checkpoints: () => [...state.checkpoints.values()].sort((a, b) => a.chainKey - b.chainKey),
    snapshot: () => ({ hash: snapshotHash(state), body: snapshot(state) }),
    serializeSnapshot: () => ({ hash: snapshotHash(state), body: snapshot(state) }),
  };
}
