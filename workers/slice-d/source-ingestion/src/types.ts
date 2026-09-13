import type { ObservationEnvelope, ReplayResult, SliceBApi } from "../../../multichain-execution/src/index.js";
import type { CheckpointOptions, CheckpointResult, PersistedSnapshotRecord, SerializedSliceBSnapshot } from "../../../slice-c/durable-storage/src/index.js";
import type { DeliveryResult, ExecutionResult, ReadOnlyProvider, RetryRequest } from "../../../slice-c/retry-orchestration/src/index.js";
export type RetryRequestWithoutContract = Omit<RetryRequest, "contract">;
import type { RetryOrchestrator } from "../../../slice-c/retry-orchestration/src/index.js";
import type { SourceScopeManifest } from "../../source-scope/src/manifest.js";

export const SOURCE_INGESTION_STATE_VERSION = "slice-d-source-ingestion-v1" as const;

export interface SourceChainIdentity {
  readonly sourceDomain: string;
  readonly chainKey: number;
  readonly evmChainId: number;
  readonly adapterVersion: string;
  readonly schemaVersion: string;
}

export interface SourceBlockHeader {
  readonly blockNumber: number;
  readonly blockHash: string;
  readonly parentHash: string | null;
  readonly timestamp: number;
}

export interface SourceLog {
  readonly address: string;
  readonly topics: readonly string[];
  readonly data: string;
  readonly transactionHash: string;
  readonly blockNumber: number;
  readonly blockHash: string;
  readonly transactionIndex: number;
  readonly logIndex: number;
}

export interface SourceTransactionReceipt {
  readonly transactionHash: string;
  readonly status: 0 | 1;
  readonly blockNumber: number;
  readonly blockHash: string;
  readonly transactionIndex: number;
  readonly logs: readonly SourceLog[];
}

export interface SourceLogFilter {
  readonly address: string;
  readonly topic0: string;
  readonly fromBlock: number;
  readonly toBlock: number;
}

export type ProviderMethod = "getChainIdentity" | "getLatestBlockNumber" | "getBlockHeader" | "getLogs" | "getTransactionReceipt";

export interface FixtureFailure {
  readonly method: ProviderMethod;
  readonly code: "TIMEOUT" | "OUTAGE" | "RATE_LIMIT";
  readonly reason: string;
  readonly remaining?: number;
}

export interface FixtureDataset {
  readonly scopeId: string;
  readonly identity: SourceChainIdentity;
  readonly latestBlockNumber: number;
  readonly blocks: readonly SourceBlockHeader[];
  readonly logs: readonly SourceLog[];
  readonly receipts: readonly SourceTransactionReceipt[];
}

export interface FixtureProviderOptions {
  readonly failures?: readonly FixtureFailure[];
  readonly identityOverride?: unknown;
  readonly latestBlockNumberOverride?: unknown;
  readonly blockOverrides?: Readonly<Record<string, unknown>>;
  readonly logsOverride?: unknown;
  readonly receiptOverrides?: Readonly<Record<string, unknown>>;
}

export interface SourceObservationCoordinates {
  readonly transactionHash: string;
  readonly transactionIndex: number;
  readonly logIndex: number;
  readonly eventIndex: number;
  readonly blockNumber: number;
  readonly blockHash: string;
  readonly parentBlockHash: string | null;
  readonly receiptStatus: 0 | 1;
}

export interface NormalizedSourceObservation {
  readonly observation: ObservationEnvelope;
  readonly payloadHash: string;
  readonly sourceEventId: string;
  readonly observationId: string;
  readonly evidenceStatus: "PENDING_PROOF";
  readonly reconciliationStatus: "RECONCILIATION_PENDING";
  readonly coordinates: SourceObservationCoordinates;
}

export interface SourceReadBundle {
  readonly identity: unknown;
  readonly block: unknown;
  readonly parent: unknown;
  readonly log: unknown;
  readonly receipt: unknown;
}

export interface BackfillRequest {
  readonly scope: string;
  readonly startBlock: number;
  readonly endBlock: number;
  readonly maxRange?: number;
  readonly finalityPolicy?: {
    readonly version: string;
    readonly depth: number;
  };
  readonly cursor?: BackfillCursor | null;
}

export interface BackfillCursor {
  readonly scope: string;
  readonly mode: "SPARSE_EVENT";
  readonly requestedStart: number;
  readonly requestedEnd: number;
  readonly nextBlock: number;
  readonly lastCompletedBlock: number | null;
  readonly sequence: number;
}

export interface AcceptedEventRecord {
  readonly eventId: string;
  readonly sourceEventId: string;
  readonly observationId: string;
  readonly relationshipId: string;
  readonly objectId: string;
  readonly blockNumber: number;
  readonly blockHash: string;
  readonly transactionHash: string;
  readonly transactionIndex: number;
  readonly logIndex: number;
  readonly eventIndex: number;
  readonly payloadHash: string;
  readonly finalityState: "UNKNOWN" | "FINALITY_PENDING" | "FINALIZED" | "REORGED";
  readonly evidenceStatus: "PENDING_PROOF";
  readonly reconciliationStatus: "RECONCILIATION_PENDING";
}

export interface RejectedEventRecord {
  readonly eventId: string;
  readonly blockNumber: number;
  readonly transactionHash: string;
  readonly logIndex: number;
  readonly code: string;
  readonly reason: string;
}

export interface DuplicateEventRecord {
  readonly eventId: string;
  readonly payloadHash: string;
  readonly disposition: "NOOP";
}

export interface ProviderErrorRecord {
  readonly method: ProviderMethod | "checkpoint" | "retry";
  readonly code: string;
  readonly reason: string;
  readonly blockNumber: number | null;
  readonly recoverable: boolean;
}

export interface RetrySummary {
  readonly disposition: "ACCEPTED" | "DUPLICATE" | "REJECTED";
  readonly jobId: string | null;
  readonly reason: string | null;
}

export type BackfillStatusMarker = "OBSERVED" | "FINALITY_PENDING" | "FINALIZED" | "PENDING_PROOF" | "RECONCILIATION_PENDING" | "RECONCILED" | "REPLAY_REQUIRED" | "REORG_DETECTED" | "MISMATCH" | "STALE" | "REJECTED" | "BLOCKED";

export type BackfillRetryStatus = "NONE" | "PENDING" | "RETRY_SCHEDULED" | "COMPLETED" | "DEAD_LETTERED" | "HANDOFF_EMITTED";

export interface BackfillResult {
  readonly status: "COMPLETED" | "FINALITY_PENDING" | "BLOCKED" | "REPLAY_REQUIRED" | "REJECTED";
  readonly statusMarkers: readonly BackfillStatusMarker[];
  readonly scope: string;
  readonly requestedRange: { readonly startBlock: number; readonly endBlock: number };
  readonly completedRange: { readonly startBlock: number; readonly endBlock: number } | null;
  readonly cursor: BackfillCursor;
  readonly observedHeight: number | null;
  readonly finalizedHeight: number | null;
  readonly acceptedEvents: readonly AcceptedEventRecord[];
  readonly rejectedEvents: readonly RejectedEventRecord[];
  readonly duplicateEvents: readonly DuplicateEventRecord[];
  readonly providerErrors: readonly ProviderErrorRecord[];
  readonly replayHistory: readonly Record<string, unknown>[];
  readonly replayTargets: readonly Record<string, unknown>[];
  readonly replayOwner: string | null;
  readonly replayRecoveryRole: string | null;
  readonly replayReason: string | null;
  readonly replayNextAction: string | null;
  readonly replayStatus: "CURRENT" | "REPLAY_REQUIRED";
  readonly evidenceStatus: "PENDING_PROOF";
  readonly reconciliationStatus: "RECONCILIATION_PENDING";
  readonly retry: RetrySummary | null;
  readonly retryStatus: BackfillRetryStatus;
  readonly deadLetters: readonly Record<string, unknown>[];
  readonly nextAction: string;
  readonly responsibleRole: "source-ingestion-operator";
  readonly snapshot: SerializedSliceBSnapshot | null;
}

export interface SerializedBackfillState {
  readonly schemaVersion: typeof SOURCE_INGESTION_STATE_VERSION;
  readonly manifestHash: string;
  readonly cursor: BackfillCursor | null;
  readonly snapshot: SerializedSliceBSnapshot | null;
  readonly acceptedEvents: readonly AcceptedEventRecord[];
  readonly rejectedEvents: readonly RejectedEventRecord[];
  readonly duplicateEvents: readonly DuplicateEventRecord[];
  readonly providerErrors: readonly ProviderErrorRecord[];
}

export interface SerializedSliceBBoundary {
  readonly initialize: (anchor: SourceBlockHeader) => SerializedSliceBSnapshot;
  readonly observeBlockHeader: (snapshot: SerializedSliceBSnapshot, header: SourceBlockHeader) => SerializedSliceBSnapshot;
  readonly ingest: (snapshot: SerializedSliceBSnapshot, observation: ObservationEnvelope) => SerializedSliceBSnapshot;
  readonly advanceFinality: (snapshot: SerializedSliceBSnapshot, finalizedBlock: number, observedAt: number) => SerializedSliceBSnapshot;
  readonly backfillReplayHeader: (snapshot: SerializedSliceBSnapshot, source: ObservationEnvelope) => SerializedSliceBSnapshot;
  readonly replay: (snapshot: SerializedSliceBSnapshot, replacement: ObservationEnvelope, finalizedBlock: number, observedAt: number) => { readonly snapshot: SerializedSliceBSnapshot; readonly outcome: ReplayResult["outcome"] };
  readonly read: (snapshot: SerializedSliceBSnapshot) => SliceBApi;
}

export interface SerializedSliceCBoundary {
  readonly checkpoint: (snapshot: SerializedSliceBSnapshot, options?: CheckpointOptions) => Promise<CheckpointResult>;
  readonly recover: () => Promise<PersistedSnapshotRecord | null>;
  readonly submitRetry: (snapshot: SerializedSliceBSnapshot, request: RetryRequestWithoutContract) => DeliveryResult;
  readonly executeRetry: (provider: ReadOnlyProvider | null, now?: number) => ExecutionResult;
  readonly serializeRetry: () => string;
  readonly restartRetry: (serialized: string) => SerializedSliceCBoundary;
  readonly read: (snapshot: SerializedSliceBSnapshot) => SliceBApi;
  readonly retryOrchestrator: RetryOrchestrator;
}

export interface SourceBackfillOptions {
  readonly manifest: SourceScopeManifest;
  readonly provider: import("./provider.js").SourceReadProvider;
  readonly c: SerializedSliceCBoundary;
  readonly autoReplay?: boolean;
  readonly clock?: () => number;
  readonly initialState?: SerializedBackfillState;
}
