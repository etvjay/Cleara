import { snapshot, snapshotHash, type EvidenceRecord, type SliceBState } from "./slice-b.js";

export interface SliceBApi {
  health(): { readonly status: "ok"; readonly readOnly: true; readonly schemaVersion: string };
  relationship(id: string): unknown;
  object(id: string): unknown | null;
  evidence(id: string): EvidenceRecord | null;
  timeline(id: string): unknown[];
  graph(id: string): unknown;
  investigations(): unknown[];
  checkpoints(): unknown[];
  snapshot(): { readonly hash: string; readonly body: string };
}

function belongsToRelationship(state: SliceBState, relationshipId: string, evidence: EvidenceRecord): boolean {
  if (evidence.relationshipId === relationshipId) return true;
  return [...state.observations.values()].some((observation) => observation.relationshipId === relationshipId && observation.evidenceId === evidence.evidenceId);
}

/** Read-only API boundary. It exposes projection records without granting authority. */
export function createSliceBApi(state: SliceBState): SliceBApi {
  return {
    health: () => ({ status: "ok", readOnly: true, schemaVersion: state.schemaVersion }),
    evidence: (id) => state.evidence.get(id) ?? null,
    object: (id) => {
      const observation = [...state.observations.values()].find((item) => item.objectId === id);
      const canonical = state.canonical.get(id) ?? null;
      const reconciliation = [...state.reconciliations.values()].find((item) => item.canonicalObjectId === id) ?? null;
      const evidence = state.evidence.get(id) ?? null;
      if (!observation && !canonical && !reconciliation && !evidence) return null;
      return { id, source: "projection", canonical: false, observation, canonicalReference: canonical, reconciliation, evidence, evidenceMode: "local_projection" };
    },
    relationship: (id) => ({
      relationshipId: id,
      source: "projection",
      canonical: false,
      observations: [...state.observations.values()].filter((item) => item.relationshipId === id),
      evidence: [...state.evidence.values()].filter((item) => belongsToRelationship(state, id, item)),
      canonicalState: [...state.canonical.values()].filter((item) => item.relationshipId === null || item.relationshipId === id),
      reconciliations: [...state.reconciliations.values()].filter((item) => item.relationshipId === id),
      graph: state.graphs.get(id) ?? null,
      evidenceMode: "local_projection",
    }),
    timeline: (id) => [...state.observations.values()].filter((item) => item.relationshipId === id).sort((a, b) => a.blockNumber < b.blockNumber ? -1 : a.blockNumber > b.blockNumber ? 1 : a.eventIndex - b.eventIndex),
    graph: (id) => state.graphs.get(id) ?? null,
    investigations: () => [
      ...[...state.reconciliations.values()].filter((item) => item.state !== "RECONCILED"),
      ...state.deadLetters,
      ...state.replayHistory.filter((attempt) => attempt.status === "BLOCKED"),
      ...[...state.observations.values()].filter((item) => item.finalityState === "REORGED" || item.observationState === "CONFLICTING"),
    ],
    checkpoints: () => [...state.checkpoints.values()].sort((a, b) => a.chainKey - b.chainKey),
    snapshot: () => ({ hash: snapshotHash(state), body: snapshot(state) }),
  };
}
