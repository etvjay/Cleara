export type Chain = "source" | "coordination";

export type Finality = "unfinalized" | "finalized";

export type SourceCommitmentStatus = "UNKNOWN" | "COMMITTED" | "CONSUMED" | "EXPIRED";

export type CoordinationCommitmentStatus = "UNKNOWN" | "ACTIVE" | "CONSUMED" | "EXPIRED";

export type AllocationStatus =
  | "UNKNOWN"
  | "PROPOSED"
  | "ACTIVE"
  | "COMMITTED"
  | "CONSUMED"
  | "EXPIRED"
  | "CANCELLED";

export type Consistency =
  | "UNKNOWN"
  | "CONSISTENT"
  | "PENDING_PROOF"
  | "PENDING_SOURCE"
  | "MISMATCH";

export interface IndexedEvent {
  chain: Chain;
  chainId: number;
  chainKey: number;
  domainId: string | null;
  blockNumber: bigint;
  blockHash: string;
  transactionHash: string;
  transactionIndex: number;
  logIndex: number;
  address: string;
  name: string;
  args: Readonly<Record<string, unknown>>;
  observedAt: number;
  finality: Finality;
}

export interface EventPointer {
  eventId: string;
  chain: Chain;
  chainId: number;
  chainKey: number;
  blockNumber: bigint;
  blockHash: string;
  transactionHash: string;
  transactionIndex: number;
  logIndex: number;
  address: string;
  name: string;
  finality: Finality;
}

export interface ProofCoordinates {
  evidenceId: string;
  domainId: string;
  chainKey: number;
  blockHeight: bigint;
  txIndex: bigint;
  eventIndex: number;
  encodedTransactionHash: string;
  payloadHash: string | null;
  queryId: string | null;
  evidenceConsumed: boolean;
}

export interface CommitmentProjection {
  commitmentId: string | null;
  sourceCommitmentId: string;
  domainId: string | null;
  sourceVault: string | null;
  facilityId: string | null;
  allocationId: string | null;
  provider: string | null;
  assetClassId: string | null;
  token: string | null;
  amount: bigint | null;
  expiresAt: bigint | null;
  sourceStatus: SourceCommitmentStatus;
  coordinationStatus: CoordinationCommitmentStatus;
  allocationStatus: AllocationStatus;
  actor: string | null;
  lifecycleEvidenceId: string | null;
  lifecycleQueryId: string | null;
  lifecycleProof: ProofCoordinates | null;
  consistency: Consistency;
  sourceEvent: EventPointer | null;
  coordinationEvent: EventPointer | null;
  updatedAt: number;
}

export interface AllocationProjection {
  allocationId: string;
  facilityId: string | null;
  provider: string | null;
  amount: bigint | null;
  expiresAt: bigint | null;
  status: AllocationStatus;
  lastEvent: EventPointer | null;
  updatedAt: number;
}

export interface FacilityProjection {
  facilityId: string;
  committedAmount: bigint | null;
  consumedAmount: bigint;
  expiredAmount: bigint;
  activeCommittedAmount: bigint | null;
  status: string | null;
  lastEvent: EventPointer | null;
  updatedAt: number;
}

export interface EvidenceProjection {
  evidenceId: string;
  domainId: string | null;
  chainKey: number | null;
  blockHeight: bigint | null;
  txIndex: bigint | null;
  eventIndex: number | null;
  encodedTransactionHash: string | null;
  payloadHash: string | null;
  consumed: boolean;
  registeredEvent: EventPointer | null;
  consumedEvent: EventPointer | null;
  updatedAt: number;
}

export interface ProjectionState {
  version: 1;
  appliedEventIds: Set<string>;
  blocks: Map<string, string>;
  commitments: Map<string, CommitmentProjection>;
  allocations: Map<string, AllocationProjection>;
  facilities: Map<string, FacilityProjection>;
  evidence: Map<string, EvidenceProjection>;
  lastObservedAt: number;
}
