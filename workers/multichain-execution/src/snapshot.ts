import type {
  AllocationProjection,
  CommitmentProjection,
  EvidenceProjection,
  EventPointer,
  FacilityProjection,
  ProjectionState,
  ProofCoordinates,
} from "./model.js";
import { ProjectionError } from "./projector.js";

type JsonEventPointer = Omit<EventPointer, "blockNumber"> & { blockNumber: string };
type JsonProofCoordinates = Omit<ProofCoordinates, "blockHeight" | "txIndex"> & {
  blockHeight: string;
  txIndex: string;
};

type JsonCommitment = Omit<CommitmentProjection, "amount" | "expiresAt" | "lifecycleProof" | "sourceEvent" | "coordinationEvent"> & {
  amount: string | null;
  expiresAt: string | null;
  lifecycleProof: JsonProofCoordinates | null;
  sourceEvent: JsonEventPointer | null;
  coordinationEvent: JsonEventPointer | null;
};

type JsonAllocation = Omit<AllocationProjection, "amount" | "expiresAt" | "lastEvent"> & {
  amount: string | null;
  expiresAt: string | null;
  lastEvent: JsonEventPointer | null;
};

type JsonFacility = Omit<FacilityProjection, "committedAmount" | "consumedAmount" | "expiredAmount" | "activeCommittedAmount" | "lastEvent"> & {
  committedAmount: string | null;
  consumedAmount: string;
  expiredAmount: string;
  activeCommittedAmount: string | null;
  lastEvent: JsonEventPointer | null;
};

type JsonEvidence = Omit<EvidenceProjection, "blockHeight" | "txIndex" | "registeredEvent" | "consumedEvent"> & {
  blockHeight: string | null;
  txIndex: string | null;
  registeredEvent: JsonEventPointer | null;
  consumedEvent: JsonEventPointer | null;
};

export interface ProjectionSnapshot {
  version: 1;
  appliedEventIds: string[];
  blocks: Array<[string, string]>;
  commitments: Array<[string, JsonCommitment]>;
  allocations: Array<[string, JsonAllocation]>;
  facilities: Array<[string, JsonFacility]>;
  evidence: Array<[string, JsonEvidence]>;
  lastObservedAt: number;
}

export function toSnapshot(state: ProjectionState): ProjectionSnapshot {
  return {
    version: 1,
    appliedEventIds: [...state.appliedEventIds].sort(),
    blocks: sortedEntries(state.blocks),
    commitments: sortedEntries(state.commitments).map(([key, value]) => [key, encodeCommitment(value)]),
    allocations: sortedEntries(state.allocations).map(([key, value]) => [key, encodeAllocation(value)]),
    facilities: sortedEntries(state.facilities).map(([key, value]) => [key, encodeFacility(value)]),
    evidence: sortedEntries(state.evidence).map(([key, value]) => [key, encodeEvidence(value)]),
    lastObservedAt: state.lastObservedAt,
  };
}

export function serializeProjectionState(state: ProjectionState): string {
  return JSON.stringify(toSnapshot(state));
}

export function fromSnapshot(snapshot: ProjectionSnapshot): ProjectionState {
  if (snapshot.version !== 1) throw new ProjectionError("INVALID_SNAPSHOT", "unsupported projection snapshot version");
  return {
    version: 1,
    appliedEventIds: new Set(snapshot.appliedEventIds),
    blocks: new Map(snapshot.blocks),
    commitments: new Map(snapshot.commitments.map(([key, value]) => [key, decodeCommitment(value)])),
    allocations: new Map(snapshot.allocations.map(([key, value]) => [key, decodeAllocation(value)])),
    facilities: new Map(snapshot.facilities.map(([key, value]) => [key, decodeFacility(value)])),
    evidence: new Map(snapshot.evidence.map(([key, value]) => [key, decodeEvidence(value)])),
    lastObservedAt: snapshot.lastObservedAt,
  };
}

export function deserializeProjectionState(serialized: string): ProjectionState {
  let snapshot: ProjectionSnapshot;
  try {
    snapshot = JSON.parse(serialized) as ProjectionSnapshot;
  } catch (error) {
    throw new ProjectionError("INVALID_SNAPSHOT", `invalid JSON snapshot: ${String(error)}`);
  }
  return fromSnapshot(snapshot);
}

function sortedEntries<T>(map: Map<string, T>): Array<[string, T]> {
  return [...map.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function encodePointer(pointer: EventPointer | null): JsonEventPointer | null {
  return pointer ? { ...pointer, blockNumber: pointer.blockNumber.toString() } : null;
}

function decodePointer(pointer: JsonEventPointer | null): EventPointer | null {
  return pointer ? { ...pointer, blockNumber: BigInt(pointer.blockNumber) } : null;
}

function encodeProof(proof: ProofCoordinates | null): JsonProofCoordinates | null {
  return proof ? { ...proof, blockHeight: proof.blockHeight.toString(), txIndex: proof.txIndex.toString() } : null;
}

function decodeProof(proof: JsonProofCoordinates | null): ProofCoordinates | null {
  return proof ? { ...proof, blockHeight: BigInt(proof.blockHeight), txIndex: BigInt(proof.txIndex) } : null;
}

function encodeCommitment(value: CommitmentProjection): JsonCommitment {
  return {
    ...value,
    amount: value.amount?.toString() ?? null,
    expiresAt: value.expiresAt?.toString() ?? null,
    lifecycleProof: encodeProof(value.lifecycleProof),
    sourceEvent: encodePointer(value.sourceEvent),
    coordinationEvent: encodePointer(value.coordinationEvent),
  };
}

function decodeCommitment(value: JsonCommitment): CommitmentProjection {
  return {
    ...value,
    amount: value.amount === null ? null : BigInt(value.amount),
    expiresAt: value.expiresAt === null ? null : BigInt(value.expiresAt),
    lifecycleProof: decodeProof(value.lifecycleProof),
    sourceEvent: decodePointer(value.sourceEvent),
    coordinationEvent: decodePointer(value.coordinationEvent),
  };
}

function encodeAllocation(value: AllocationProjection): JsonAllocation {
  return {
    ...value,
    amount: value.amount?.toString() ?? null,
    expiresAt: value.expiresAt?.toString() ?? null,
    lastEvent: encodePointer(value.lastEvent),
  };
}

function decodeAllocation(value: JsonAllocation): AllocationProjection {
  return {
    ...value,
    amount: value.amount === null ? null : BigInt(value.amount),
    expiresAt: value.expiresAt === null ? null : BigInt(value.expiresAt),
    lastEvent: decodePointer(value.lastEvent),
  };
}

function encodeFacility(value: FacilityProjection): JsonFacility {
  return {
    ...value,
    committedAmount: value.committedAmount?.toString() ?? null,
    consumedAmount: value.consumedAmount.toString(),
    expiredAmount: value.expiredAmount.toString(),
    activeCommittedAmount: value.activeCommittedAmount?.toString() ?? null,
    lastEvent: encodePointer(value.lastEvent),
  };
}

function decodeFacility(value: JsonFacility): FacilityProjection {
  return {
    ...value,
    committedAmount: value.committedAmount === null ? null : BigInt(value.committedAmount),
    consumedAmount: BigInt(value.consumedAmount),
    expiredAmount: BigInt(value.expiredAmount),
    activeCommittedAmount: value.activeCommittedAmount === null ? null : BigInt(value.activeCommittedAmount),
    lastEvent: decodePointer(value.lastEvent),
  };
}

function encodeEvidence(value: EvidenceProjection): JsonEvidence {
  return {
    ...value,
    blockHeight: value.blockHeight?.toString() ?? null,
    txIndex: value.txIndex?.toString() ?? null,
    registeredEvent: encodePointer(value.registeredEvent),
    consumedEvent: encodePointer(value.consumedEvent),
  };
}

function decodeEvidence(value: JsonEvidence): EvidenceProjection {
  return {
    ...value,
    blockHeight: value.blockHeight === null ? null : BigInt(value.blockHeight),
    txIndex: value.txIndex === null ? null : BigInt(value.txIndex),
    registeredEvent: decodePointer(value.registeredEvent),
    consumedEvent: decodePointer(value.consumedEvent),
  };
}
