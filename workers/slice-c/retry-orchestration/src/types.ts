export const SLICE_B_SCHEMA_VERSION = "slice-b-read-model-v1" as const;
export const SLICE_C_SCHEMA_VERSION = "slice-c-retry-orchestration-v1" as const;

export type RelationshipId = string | null;

export type SliceBRecordKind =
  | "observation"
  | "evidence"
  | "canonical"
  | "reconciliation"
  | "checkpoint"
  | "dead-letter"
  | "replay";

export interface SerializedSliceBContract {
  readonly hash: string;
  readonly body: string;
}

export interface RecordSelector {
  readonly kind: SliceBRecordKind;
  readonly id: string;
}

export type RetryOperation = "provider-read" | "replay-required-handoff";

export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly multiplier: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = Object.freeze({
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 10_000,
  multiplier: 2,
});

export interface RetryRequest {
  readonly deliveryId: string;
  readonly contract: SerializedSliceBContract;
  readonly selector: RecordSelector;
  readonly relationshipId: RelationshipId;
  readonly provider: string;
  readonly operation: RetryOperation;
  readonly policy?: RetryPolicy;
}

export interface SourceCursor {
  readonly chainKey: number | null;
  readonly blockNumber: string | null;
  readonly eventIndex: number | null;
  readonly sequence: number | null;
  readonly occurredAt: number | null;
}

export interface RetrySourceView {
  readonly snapshotHash: string;
  readonly snapshotBody: string;
  readonly schemaVersion: typeof SLICE_B_SCHEMA_VERSION;
  readonly recordKind: SliceBRecordKind;
  readonly recordId: string;
  readonly relationshipId: RelationshipId;
  readonly cursor: SourceCursor;
  readonly sourceScopeHash: string | null;
  readonly snapshotBindingHash: string;
  readonly sourceDomain: string;
  readonly chainId: number;
  readonly adapterVersion: string;
  readonly observationSchemaVersion: string;
  readonly finalityPolicyVersion: string;
  readonly cursorMode: "SPARSE_EVENT";
  readonly status: Readonly<Record<string, string | null>>;
  readonly replay: ReplayMetadata | null;
}

export interface ReplayMetadata {
  readonly replaySequence: number;
  readonly replayFromBlock: string | null;
  readonly replayOldBlockHash: string | null;
  readonly replayParentBlockHash: string | null;
  readonly replayTargets: readonly ReplayTargetView[];
}

export type RetryJobStatus =
  | "PENDING"
  | "RETRY_SCHEDULED"
  | "COMPLETED"
  | "DEAD_LETTERED"
  | "HANDOFF_EMITTED";

export type ProviderReceiptValue = string | number | boolean | null;
export type ProviderReceipt = Readonly<Record<string, ProviderReceiptValue>>;

export interface RetryJob {
  readonly id: string;
  readonly provider: string;
  readonly operation: RetryOperation;
  readonly selector: RecordSelector;
  readonly relationshipId: RelationshipId;
  readonly source: RetrySourceView;
  readonly policy: RetryPolicy;
  readonly status: RetryJobStatus;
  readonly attempts: number;
  readonly nextAttemptAt: number;
  readonly lastError: string | null;
  readonly result: ProviderReceipt | null;
  readonly deliveryIds: readonly string[];
  readonly handoffId: string | null;
}

export type DeliveryDisposition = "ACCEPTED" | "DUPLICATE" | "REJECTED";

export interface DeliveryReceipt {
  readonly deliveryId: string;
  readonly jobId: string | null;
  readonly requestHash: string;
  readonly disposition: DeliveryDisposition;
  readonly reason: string | null;
}

export type DeadLetterKind = "CONTRACT" | "SCOPE" | "DELIVERY" | "PROVIDER" | "REPLAY";

export interface DeadLetterRecord {
  readonly id: string;
  readonly kind: DeadLetterKind;
  readonly jobId: string | null;
  readonly deliveryId: string | null;
  readonly relationshipId: RelationshipId;
  readonly recordKind: SliceBRecordKind | null;
  readonly recordId: string | null;
  readonly snapshotHash: string | null;
  readonly code: string;
  readonly reason: string;
  readonly attempts: number;
  readonly status: "DEAD_LETTER";
  readonly recoveryRole: "retry-orchestration-operator";
  readonly nextAction: string;
  readonly sourceStatus: Readonly<Record<string, string | null>>;
}

export interface ReplayTargetView {
  readonly chainKey: number;
  readonly blockNumber: string;
  readonly oldBlockHash: string | null;
  readonly oldParentBlockHash: string | null;
  readonly expectedParentBlockHash: string | null;
}

export interface ReplayRequiredHandoff {
  readonly id: string;
  readonly status: "REPLAY_REQUIRED";
  readonly relationshipId: null;
  readonly chainKey: number;
  readonly sourceSnapshotHash: string;
  readonly replaySequence: number;
  readonly replayFromBlock: string | null;
  readonly replayOldBlockHash: string | null;
  readonly replayParentBlockHash: string | null;
  readonly replayTargets: readonly ReplayTargetView[];
  readonly recoveryRole: "projection operator";
  readonly nextAction: string;
  readonly authority: "projection";
}

export type ProviderResult =
  | { readonly outcome: "success"; readonly receipt?: ProviderReceipt }
  | { readonly outcome: "outage"; readonly code?: string; readonly reason: string }
  | { readonly outcome: "permanent-failure"; readonly code: string; readonly reason: string };

export interface ReadOnlyProvider {
  readonly read: (job: Readonly<RetryJob>) => ProviderResult;
}

export type ExecutionOutcome =
  | "IDLE"
  | "RETRY_SCHEDULED"
  | "COMPLETED"
  | "DEAD_LETTERED"
  | "HANDOFF_EMITTED";

export interface ExecutionResult {
  readonly outcome: ExecutionOutcome;
  readonly job: RetryJob | null;
  readonly deadLetter: DeadLetterRecord | null;
  readonly handoff: ReplayRequiredHandoff | null;
}

export interface DeliveryResult {
  readonly disposition: DeliveryDisposition;
  readonly job: RetryJob | null;
  readonly receipt: DeliveryReceipt;
  readonly deadLetter: DeadLetterRecord | null;
}

export interface RetryOrchestrationSnapshot {
  readonly schemaVersion: typeof SLICE_C_SCHEMA_VERSION;
  readonly jobs: readonly RetryJob[];
  readonly deliveries: readonly DeliveryReceipt[];
  readonly deadLetters: readonly DeadLetterRecord[];
  readonly handoffs: readonly ReplayRequiredHandoff[];
}

export interface ProviderOutageSimulatorOptions {
  readonly provider?: string;
  readonly failuresBeforeSuccess?: number;
  readonly alwaysOutage?: boolean;
  readonly reason?: string;
}
