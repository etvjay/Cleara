import { snapshot, snapshotHash, type SliceBState } from "./slice-b.js";

export interface SliceBApi {
  health(): { readonly status: "ok"; readonly readOnly: true; readonly schemaVersion: string };
  relationship(id: string): unknown;
  object(id: string): unknown | null;
  timeline(id: string): unknown[];
  graph(id: string): unknown;
  investigations(): unknown[];
  checkpoints(): unknown[];
  snapshot(): { readonly hash: string; readonly body: string };
}

/**
 * Read-only API boundary for local Slice B consumers. It returns projection
 * records with their authority/evidence axes intact. It does not mutate state.
 */
export function createSliceBApi(state: SliceBState): SliceBApi {
  return {
    health: () => ({ status: "ok", readOnly: true, schemaVersion: state.schemaVersion }),
    object: (id) => {
      const observation = [...state.observations.values()].find((item) => item.objectId === id);
      const canonical = state.canonical.get(id) ?? null;
      const reconciliation = [...state.reconciliations.values()].find((item) => item.canonicalObjectId === id) ?? null;
      if (!observation && !canonical && !reconciliation) return null;
      return { id, source: "projection", canonical: false, observation, canonicalReference: canonical, reconciliation, evidenceMode: "local_projection" };
    },
    relationship: (id) => ({
      relationshipId: id,
      source: "projection",
      canonical: false,
      observations: [...state.observations.values()].filter((item) => item.relationshipId === id),
      evidence: [...state.evidence.values()].filter((item) => [...state.observations.values()].some((observation) => observation.relationshipId === id && observation.evidenceId === item.evidenceId)),
      canonicalState: [...state.canonical.values()],
      reconciliations: [...state.reconciliations.values()].filter((item) => item.relationshipId === id),
      graph: state.graphs.get(id) ?? null,
      evidenceMode: "local_projection",
    }),
    timeline: (id) => [...state.observations.values()].filter((item) => item.relationshipId === id).sort((a, b) => a.blockNumber < b.blockNumber ? -1 : a.blockNumber > b.blockNumber ? 1 : a.eventIndex - b.eventIndex),
    graph: (id) => state.graphs.get(id) ?? null,
    investigations: () => [
      ...[...state.reconciliations.values()].filter((item) => item.state !== "RECONCILED"),
      ...state.deadLetters,
      ...[...state.observations.values()].filter((item) => item.finalityState === "REORGED" || item.observationState === "CONFLICTING"),
    ],
    checkpoints: () => [...state.checkpoints.values()].sort((a, b) => a.chainKey - b.chainKey),
    snapshot: () => ({ hash: snapshotHash(state), body: snapshot(state) }),
  };
}
