import { snapshot, snapshotHash, type EvidenceRecord, type SliceBState } from "./slice-b.js";

export interface SliceBApi {
  health(): { readonly status: "ok"; readonly readOnly: true; readonly schemaVersion: string };
  relationship(id: string): unknown;
  object(id: string, relationshipId?: string): unknown | null;
  evidence(id: string): EvidenceRecord | null;
  timeline(id: string): unknown[];
  graph(id: string): unknown;
  investigations(relationshipId?: string): unknown[];
  checkpoints(): unknown[];
  snapshot(): { readonly hash: string; readonly body: string };
}

function belongsToRelationship(_state: SliceBState, relationshipId: string, evidence: EvidenceRecord): boolean {
  return evidence.relationshipId === relationshipId;
}

function scopedObject(state: SliceBState, id: string, relationshipId?: string): unknown | null {
  const observations = [...state.observations.values()].filter((item) => item.objectId === id && (relationshipId === undefined || item.relationshipId === relationshipId));
  const canonical = [...state.canonical.values()].filter((item) => item.objectId === id && (relationshipId === undefined || item.relationshipId === relationshipId));
  const reconciliations = [...state.reconciliations.values()].filter((item) => item.canonicalObjectId === id && (relationshipId === undefined || item.relationshipId === relationshipId));
  const evidenceRecord = state.evidence.get(id);
  const evidence = evidenceRecord && (relationshipId === undefined || evidenceRecord.relationshipId === relationshipId) ? evidenceRecord : undefined;
  const relationships = new Set<string>([
    ...observations.map((item) => item.relationshipId),
    ...canonical.flatMap((item) => item.relationshipId === null ? [] : [item.relationshipId]),
    ...reconciliations.map((item) => item.relationshipId),
    ...(evidence?.relationshipId ? [evidence.relationshipId] : []),
  ]);
  if (relationshipId === undefined && relationships.size > 1) return { error: "AMBIGUOUS_OBJECT_SCOPE", objectId: id, relationships: [...relationships].sort() };
  if (!observations.length && !canonical.length && !reconciliations.length && !evidence) return null;
  return { id, relationshipId: relationshipId ?? (relationships.size === 1 ? [...relationships][0] : null), source: "projection", canonical: false, observations, canonicalReference: canonical.length === 1 ? canonical[0] : canonical, reconciliations, evidence, evidenceMode: "local_projection" };
}

/** Read-only API boundary. It exposes projection records without granting authority. */
export function createSliceBApi(state: SliceBState): SliceBApi {
  return {
    health: () => ({ status: "ok", readOnly: true, schemaVersion: state.schemaVersion }),
    evidence: (id) => state.evidence.get(id) ?? null,
    object: (id, relationshipId) => scopedObject(state, id, relationshipId),
    relationship: (id) => ({
      relationshipId: id,
      source: "projection",
      canonical: false,
      observations: [...state.observations.values()].filter((item) => item.relationshipId === id),
      evidence: [...state.evidence.values()].filter((item) => belongsToRelationship(state, id, item)),
      canonicalState: [...state.canonical.values()].filter((item) => item.relationshipId === id),
      reconciliations: [...state.reconciliations.values()].filter((item) => item.relationshipId === id),
      reconciliationHistory: [...state.reconciliationHistory].filter((item) => item.relationshipId === id),
      graph: state.graphs.get(id) ?? null,
      evidenceMode: "local_projection",
    }),
    timeline: (id) => [...state.observations.values()].filter((item) => item.relationshipId === id).sort((a, b) => a.blockNumber < b.blockNumber ? -1 : a.blockNumber > b.blockNumber ? 1 : a.eventIndex - b.eventIndex || a.observationId.localeCompare(b.observationId)),
    graph: (id) => state.graphs.get(id) ?? null,
    investigations: (relationshipId) => [
      ...[...state.reconciliations.values()].filter((item) => item.state !== "RECONCILED" && (relationshipId === undefined || item.relationshipId === relationshipId)),
      ...state.evidenceConflicts.filter((item) => relationshipId === undefined || item.relationshipId === relationshipId || item.existingRelationshipId === relationshipId),
      ...state.deadLetters.filter((item) => relationshipId === undefined || item.relationshipId === relationshipId),
      ...state.replayHistory.filter((attempt) => attempt.status === "BLOCKED" && (relationshipId === undefined || attempt.relationshipId === relationshipId)),
      ...[...state.observations.values()].filter((item) => (item.finalityState === "REORGED" || item.observationState === "CONFLICTING") && (relationshipId === undefined || item.relationshipId === relationshipId)),
    ],
    checkpoints: () => [...state.checkpoints.values()].sort((a, b) => a.chainKey - b.chainKey),
    snapshot: () => ({ hash: snapshotHash(state), body: snapshot(state) }),
  };
}
