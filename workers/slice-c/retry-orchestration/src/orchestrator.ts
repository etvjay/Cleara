import {
  ContractError,
  parseSerializedSliceBContract,
  requireReplayRequired,
  selectContractRecord,
  type ParsedSliceBContract,
  type ParsedSliceBRecord,
} from "./contract.js";
import { identityHash } from "./canonical.js";
import {
  DEFAULT_RETRY_POLICY,
  SLICE_C_SCHEMA_VERSION,
  type DeadLetterKind,
  type DeadLetterRecord,
  type DeliveryReceipt,
  type DeliveryResult,
  type ExecutionResult,
  type ProviderOutageSimulatorOptions,
  type ProviderReceipt,
  type ProviderResult,
  type ReadOnlyProvider,
  type RelationshipId,
  type ReplayRequiredHandoff,
  type RetryJob,
  type RetryJobStatus,
  type RetryOrchestrationSnapshot,
  type RetryPolicy,
  type RetryRequest,
  type RetrySourceView,
  type SourceCursor,
} from "./types.js";

const MAX_ATTEMPTS = 8;
const MAX_DELAY_MS = 3_600_000;
const MAX_BATCH_SIZE = 1_000;

type InputRecord = Record<string, unknown>;

export class RetryOrchestrationError extends Error {
  public readonly name = "RetryOrchestrationError";

  public constructor(public readonly code: string, message: string) {
    super(message);
  }
}

function isPlainRecord(value: unknown): value is InputRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null)
    && Object.keys(value).every((key) => !["__proto__", "constructor", "prototype"].includes(key));
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new RetryOrchestrationError("INVALID_REQUEST", `${field} must be a nonempty trimmed string`);
  }
  return value;
}

function scopeValue(value: unknown): RelationshipId {
  if (value === null) return null;
  return requiredString(value, "relationshipId");
}

function normalizePolicy(value: RetryPolicy | undefined): RetryPolicy {
  const candidate = value ?? DEFAULT_RETRY_POLICY;
  if (!isPlainRecord(candidate)) throw new RetryOrchestrationError("INVALID_POLICY", "retry policy must be a plain object");
  const maxAttempts = candidate.maxAttempts;
  const initialDelayMs = candidate.initialDelayMs;
  const maxDelayMs = candidate.maxDelayMs;
  const multiplier = candidate.multiplier;
  if (typeof maxAttempts !== "number" || !Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > MAX_ATTEMPTS) {
    throw new RetryOrchestrationError("INVALID_POLICY", `maxAttempts must be an integer from 1 to ${MAX_ATTEMPTS}`);
  }
  if (typeof initialDelayMs !== "number" || !Number.isSafeInteger(initialDelayMs) || initialDelayMs < 0 || initialDelayMs > MAX_DELAY_MS) {
    throw new RetryOrchestrationError("INVALID_POLICY", `initialDelayMs must be an integer from 0 to ${MAX_DELAY_MS}`);
  }
  if (typeof maxDelayMs !== "number" || !Number.isSafeInteger(maxDelayMs) || maxDelayMs < 0 || maxDelayMs > MAX_DELAY_MS || maxDelayMs < initialDelayMs) {
    throw new RetryOrchestrationError("INVALID_POLICY", `maxDelayMs must be an integer from initialDelayMs to ${MAX_DELAY_MS}`);
  }
  if (typeof multiplier !== "number" || !Number.isFinite(multiplier) || multiplier < 1 || multiplier > 4) {
    throw new RetryOrchestrationError("INVALID_POLICY", "multiplier must be between 1 and 4");
  }
  return Object.freeze({ maxAttempts, initialDelayMs, maxDelayMs, multiplier });
}

function requestRecord(input: unknown): InputRecord {
  if (!isPlainRecord(input)) throw new RetryOrchestrationError("INVALID_REQUEST", "retry request must be a plain object");
  return input;
}

function requestHashFor(request: InputRecord, normalizedPolicy: RetryPolicy | null, normalizedSelector: { kind: string; id: string } | null): string {
  const contract = isPlainRecord(request.contract) ? request.contract : null;
  return identityHash({
    version: "slice-c-delivery-v1",
    deliveryId: typeof request.deliveryId === "string" ? request.deliveryId : "invalid-delivery",
    contract: contract && typeof contract.hash === "string" && typeof contract.body === "string"
      ? { hash: contract.hash, body: contract.body }
      : contract,
    selector: normalizedSelector ?? request.selector ?? null,
    relationshipId: request.relationshipId ?? null,
    provider: request.provider ?? null,
    operation: request.operation ?? null,
    policy: normalizedPolicy,
  });
}

function safeDeliveryId(request: InputRecord): string {
  return typeof request.deliveryId === "string" && request.deliveryId.trim() === request.deliveryId && request.deliveryId.length > 0
    ? request.deliveryId
    : "invalid-delivery";
}

function safeScope(request: InputRecord): RelationshipId {
  try {
    return scopeValue(request.relationshipId);
  } catch {
    return null;
  }
}

function safeSelector(request: InputRecord): { kind: RetryRequest["selector"]["kind"]; id: string } | null {
  if (!isPlainRecord(request.selector) || typeof request.selector.kind !== "string" || typeof request.selector.id !== "string") return null;
  return { kind: request.selector.kind as RetryRequest["selector"]["kind"], id: request.selector.id };
}

function errorKind(code: string): DeadLetterKind {
  if (code === "SCOPE_MISMATCH" || code === "AMBIGUOUS_RECORD_SCOPE") return "SCOPE";
  if (code === "DELIVERY_ID_CONFLICT") return "DELIVERY";
  if (code === "REPLAY_NOT_REQUIRED") return "REPLAY";
  return "CONTRACT";
}

function parseIntegerText(value: string | null): bigint | null {
  if (value === null) return null;
  if (/^\d+n$/.test(value)) return BigInt(value.slice(0, -1));
  if (/^\d+$/.test(value)) return BigInt(value);
  return null;
}

function compareNullableNumber(left: number | null, right: number | null): number {
  if (left === right) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  return left < right ? -1 : 1;
}

function compareNullableBigInt(left: string | null, right: string | null): number {
  const leftValue = parseIntegerText(left);
  const rightValue = parseIntegerText(right);
  if (leftValue === null || rightValue === null) return left === right ? 0 : left === null ? -1 : right === null ? 1 : left.localeCompare(right);
  if (leftValue === rightValue) return 0;
  return leftValue < rightValue ? -1 : 1;
}

function compareCursor(left: SourceCursor, right: SourceCursor): number {
  return compareNullableNumber(left.chainKey, right.chainKey)
    || compareNullableBigInt(left.blockNumber, right.blockNumber)
    || compareNullableNumber(left.eventIndex, right.eventIndex)
    || compareNullableNumber(left.sequence, right.sequence)
    || compareNullableNumber(left.occurredAt, right.occurredAt);
}

function compareJobs(left: RetryJob, right: RetryJob): number {
  const scopeComparison = left.relationshipId === right.relationshipId
    ? 0
    : left.relationshipId === null ? -1
      : right.relationshipId === null ? 1
        : left.relationshipId.localeCompare(right.relationshipId);
  return scopeComparison
    || compareCursor(left.source.cursor, right.source.cursor)
    || left.source.recordKind.localeCompare(right.source.recordKind)
    || left.source.recordId.localeCompare(right.source.recordId)
    || left.id.localeCompare(right.id);
}

function cloneStatus(status: Readonly<Record<string, string | null>>): Readonly<Record<string, string | null>> {
  return Object.freeze({ ...status });
}

function cloneCursor(cursor: SourceCursor): SourceCursor {
  return Object.freeze({ ...cursor });
}

function sourceDescriptor(contract: ParsedSliceBContract, cursor: SourceCursor): {
  readonly sourceDomain: string;
  readonly chainId: number;
  readonly adapterVersion: string;
  readonly observationSchemaVersion: string;
  readonly finalityPolicyVersion: string;
  readonly cursorMode: "SPARSE_EVENT";
  readonly sourceScopeHash: string | null;
} {
  const unbound = {
    sourceDomain: "UNBOUND_GENERIC_SOURCE",
    chainId: 0,
    adapterVersion: "UNBOUND_GENERIC_SOURCE",
    observationSchemaVersion: "UNBOUND_GENERIC_SOURCE",
    finalityPolicyVersion: "UNBOUND_GENERIC_SOURCE",
    cursorMode: "SPARSE_EVENT" as const,
    sourceScopeHash: null,
  };
  if (cursor.chainKey === null) return unbound;
  const entries = contract.body.sourceScopes;
  if (!Array.isArray(entries)) return unbound;
  const entry = entries.find((value) => Array.isArray(value) && value.length === 2 && value[0] === cursor.chainKey);
  if (!Array.isArray(entry) || !isPlainRecord(entry[1])) return unbound;
  const scope = entry[1];
  if (typeof scope.sourceDomain !== "string" || typeof scope.chainId !== "number" || !Number.isSafeInteger(scope.chainId) || scope.chainId < 1 || typeof scope.adapterVersion !== "string" || typeof scope.observationSchemaVersion !== "string" || typeof scope.finalityPolicyVersion !== "string" || scope.cursorMode !== "SPARSE_EVENT") return unbound;
  return {
    sourceDomain: scope.sourceDomain,
    chainId: scope.chainId,
    adapterVersion: scope.adapterVersion,
    observationSchemaVersion: scope.observationSchemaVersion,
    finalityPolicyVersion: scope.finalityPolicyVersion,
    cursorMode: "SPARSE_EVENT",
    sourceScopeHash: typeof scope.sourceScopeHash === "string" ? scope.sourceScopeHash : null,
  };
}

function sourceView(contract: ParsedSliceBContract, record: ParsedSliceBRecord): RetrySourceView {
  const descriptor = sourceDescriptor(contract, record.cursor);
  const replay = record.replay === null ? null : Object.freeze({
    replaySequence: record.replay.replaySequence,
    replayFromBlock: record.replay.replayFromBlock,
    replayOldBlockHash: record.replay.replayOldBlockHash,
    replayParentBlockHash: record.replay.replayParentBlockHash,
    replayTargets: Object.freeze(record.replay.replayTargets.map((target) => Object.freeze({ ...target }))),
  });
  const sourceWithoutBinding = {
    snapshotHash: contract.hash,
    schemaVersion: "slice-b-read-model-v1" as const,
    recordKind: record.kind,
    recordId: record.id,
    relationshipId: record.relationshipId,
    cursor: cloneCursor(record.cursor),
    sourceScopeHash: descriptor.sourceScopeHash,
    sourceDomain: descriptor.sourceDomain,
    chainId: descriptor.chainId,
    adapterVersion: descriptor.adapterVersion,
    observationSchemaVersion: descriptor.observationSchemaVersion,
    finalityPolicyVersion: descriptor.finalityPolicyVersion,
    cursorMode: descriptor.cursorMode,
    status: cloneStatus(record.status),
    replay,
  };
  return Object.freeze({
    ...sourceWithoutBinding,
    snapshotBindingHash: identityHash({ version: "slice-c-source-binding-v1", source: sourceWithoutBinding }),
  });
}

function exactSnapshotKeys(value: Record<string, unknown>, expected: readonly string[], field: string): void {
  const actual = Reflect.ownKeys(value);
  if (actual.some((key) => typeof key !== "string")) throw new RetryOrchestrationError("INVALID_SNAPSHOT", `${field} contains a symbol key`);
  const names = (actual as string[]).sort();
  const target = [...expected].sort();
  if (names.length !== target.length || names.some((key, index) => key !== target[index])) throw new RetryOrchestrationError("INVALID_SNAPSHOT", `${field} has an invalid shape`);
  for (const key of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw new RetryOrchestrationError("INVALID_SNAPSHOT", `${field}.${key} is not a data property`);
  }
}

function snapshotString(value: unknown, field: string, nullable = false): void {
  if (nullable && value === null) return;
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) throw new RetryOrchestrationError("INVALID_SNAPSHOT", `${field} must be a nonempty trimmed string`);
}

function snapshotNullableNumber(value: unknown, field: string, integer = false): void {
  if (value === null) return;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value))) throw new RetryOrchestrationError("INVALID_SNAPSHOT", `${field} is invalid`);
}

function snapshotBigIntText(value: unknown, field: string, nullable = false): void {
  if (nullable && value === null) return;
  if (typeof value !== "string" || !/^\d+n$/.test(value)) throw new RetryOrchestrationError("INVALID_SNAPSHOT", `${field} must be a nonnegative bigint string`);
}

function validateSourceCursorSnapshot(value: unknown): void {
  if (!isPlainRecord(value)) throw new RetryOrchestrationError("INVALID_SNAPSHOT", "retry job source cursor must be a plain object");
  exactSnapshotKeys(value, ["chainKey", "blockNumber", "eventIndex", "sequence", "occurredAt"], "retry job source cursor");
  snapshotNullableNumber(value.chainKey, "retry job source cursor.chainKey", true);
  snapshotBigIntText(value.blockNumber, "retry job source cursor.blockNumber", true);
  snapshotNullableNumber(value.eventIndex, "retry job source cursor.eventIndex", true);
  snapshotNullableNumber(value.sequence, "retry job source cursor.sequence", true);
  snapshotNullableNumber(value.occurredAt, "retry job source cursor.occurredAt");
}

function validateSourceStatusSnapshot(value: unknown): void {
  if (!isPlainRecord(value)) throw new RetryOrchestrationError("INVALID_SNAPSHOT", "retry job source status must be a plain object");
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") throw new RetryOrchestrationError("INVALID_SNAPSHOT", "retry job source status contains a symbol key");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor) || (descriptor.value !== null && typeof descriptor.value !== "string")) throw new RetryOrchestrationError("INVALID_SNAPSHOT", "retry job source status contains an invalid value");
  }
}

function validateReplaySnapshot(value: unknown): void {
  if (value === null) return;
  if (!isPlainRecord(value)) throw new RetryOrchestrationError("INVALID_SNAPSHOT", "retry job replay metadata must be a plain object or null");
  exactSnapshotKeys(value, ["replaySequence", "replayFromBlock", "replayOldBlockHash", "replayParentBlockHash", "replayTargets"], "retry job replay metadata");
  snapshotNullableNumber(value.replaySequence, "retry job replaySequence", true);
  snapshotBigIntText(value.replayFromBlock, "retry job replayFromBlock", true);
  snapshotString(value.replayOldBlockHash, "retry job replayOldBlockHash", true);
  snapshotString(value.replayParentBlockHash, "retry job replayParentBlockHash", true);
  if (!Array.isArray(value.replayTargets)) throw new RetryOrchestrationError("INVALID_SNAPSHOT", "retry job replayTargets must be an array");
  for (const [index, raw] of value.replayTargets.entries()) {
    if (!isPlainRecord(raw)) throw new RetryOrchestrationError("INVALID_SNAPSHOT", `retry job replayTargets[${index}] is invalid`);
    exactSnapshotKeys(raw, ["chainKey", "blockNumber", "oldBlockHash", "oldParentBlockHash", "expectedParentBlockHash"], `retry job replayTargets[${index}]`);
    snapshotNullableNumber(raw.chainKey, `retry job replayTargets[${index}].chainKey`, true);
    snapshotBigIntText(raw.blockNumber, `retry job replayTargets[${index}].blockNumber`);
    snapshotString(raw.oldBlockHash, `retry job replayTargets[${index}].oldBlockHash`, true);
    snapshotString(raw.oldParentBlockHash, `retry job replayTargets[${index}].oldParentBlockHash`, true);
    snapshotString(raw.expectedParentBlockHash, `retry job replayTargets[${index}].expectedParentBlockHash`, true);
  }
}

function validateRetrySourceSnapshot(value: unknown): void {
  if (!isPlainRecord(value)) throw new RetryOrchestrationError("INVALID_SNAPSHOT", "retry job source must be a plain object");
  exactSnapshotKeys(value, ["snapshotHash", "schemaVersion", "recordKind", "recordId", "relationshipId", "cursor", "sourceScopeHash", "snapshotBindingHash", "sourceDomain", "chainId", "adapterVersion", "observationSchemaVersion", "finalityPolicyVersion", "cursorMode", "status", "replay"], "retry job source");
  snapshotString(value.snapshotHash, "retry job source.snapshotHash");
  if (value.schemaVersion !== "slice-b-read-model-v1") throw new RetryOrchestrationError("INVALID_SNAPSHOT", "retry job source schema is unsupported");
  snapshotString(value.recordKind, "retry job source.recordKind");
  snapshotString(value.recordId, "retry job source.recordId");
  if (value.relationshipId !== null) snapshotString(value.relationshipId, "retry job source.relationshipId");
  validateSourceCursorSnapshot(value.cursor);
  snapshotString(value.sourceScopeHash, "retry job source.sourceScopeHash", true);
  if (value.sourceScopeHash !== null && (typeof value.sourceScopeHash !== "string" || !/^[0-9a-f]{64}$/.test(value.sourceScopeHash))) throw new RetryOrchestrationError("INVALID_SNAPSHOT", "retry job source.sourceScopeHash must be a SHA-256 hex digest");
  snapshotString(value.snapshotBindingHash, "retry job source.snapshotBindingHash");
  snapshotString(value.sourceDomain, "retry job source.sourceDomain");
  snapshotNullableNumber(value.chainId, "retry job source.chainId", true);
  snapshotString(value.adapterVersion, "retry job source.adapterVersion");
  snapshotString(value.observationSchemaVersion, "retry job source.observationSchemaVersion");
  snapshotString(value.finalityPolicyVersion, "retry job source.finalityPolicyVersion");
  if (value.cursorMode !== "SPARSE_EVENT") throw new RetryOrchestrationError("INVALID_SNAPSHOT", "retry job source cursor mode is unsupported");
  validateSourceStatusSnapshot(value.status);
  validateReplaySnapshot(value.replay);
  const { snapshotBindingHash, ...source } = value;
  if (identityHash({ version: "slice-c-source-binding-v1", source }) !== snapshotBindingHash) throw new RetryOrchestrationError("INVALID_SNAPSHOT", "retry job source binding does not match its serialized source metadata");
}

function validateRetryJobSnapshot(value: unknown): void {
  if (!isPlainRecord(value)) throw new RetryOrchestrationError("INVALID_SNAPSHOT", "retry snapshot contains an invalid job");
  exactSnapshotKeys(value, ["id", "provider", "operation", "selector", "relationshipId", "source", "policy", "status", "attempts", "nextAttemptAt", "lastError", "result", "deliveryIds", "handoffId"], "retry job");
  snapshotString(value.id, "retry job.id");
  snapshotString(value.provider, "retry job.provider");
  if (value.operation !== "provider-read" && value.operation !== "replay-required-handoff") throw new RetryOrchestrationError("INVALID_SNAPSHOT", "retry job operation is unsupported");
  if (!isPlainRecord(value.selector)) throw new RetryOrchestrationError("INVALID_SNAPSHOT", "retry job selector is invalid");
  exactSnapshotKeys(value.selector, ["kind", "id"], "retry job selector");
  snapshotString(value.selector.kind, "retry job selector.kind");
  snapshotString(value.selector.id, "retry job selector.id");
  if (value.relationshipId !== null) snapshotString(value.relationshipId, "retry job relationshipId");
  validateRetrySourceSnapshot(value.source);
  if (!isPlainRecord(value.policy)) throw new RetryOrchestrationError("INVALID_SNAPSHOT", "retry job policy is invalid");
  exactSnapshotKeys(value.policy, ["maxAttempts", "initialDelayMs", "maxDelayMs", "multiplier"], "retry job policy");
  normalizePolicy(value.policy as unknown as RetryPolicy);
  if (!["PENDING", "RETRY_SCHEDULED", "COMPLETED", "DEAD_LETTERED", "HANDOFF_EMITTED"].includes(String(value.status))) throw new RetryOrchestrationError("INVALID_SNAPSHOT", "retry job status is unsupported");
  snapshotNullableNumber(value.attempts, "retry job attempts", true);
  snapshotNullableNumber(value.nextAttemptAt, "retry job nextAttemptAt");
  snapshotString(value.lastError, "retry job lastError", true);
  if (value.result !== null && !isPlainRecord(value.result)) throw new RetryOrchestrationError("INVALID_SNAPSHOT", "retry job result is invalid");
  if (!Array.isArray(value.deliveryIds) || value.deliveryIds.some((item) => typeof item !== "string") || new Set(value.deliveryIds).size !== value.deliveryIds.length) throw new RetryOrchestrationError("INVALID_SNAPSHOT", "retry job deliveryIds are invalid");
  snapshotString(value.handoffId, "retry job handoffId", true);
}

function ready(job: RetryJob, now: number): boolean {
  return (job.status === "PENDING" || job.status === "RETRY_SCHEDULED") && job.nextAttemptAt <= now;
}

function delayFor(policy: RetryPolicy, failedAttempt: number): number {
  let delay = policy.initialDelayMs;
  for (let attempt = 1; attempt < failedAttempt; attempt += 1) delay = Math.min(policy.maxDelayMs, Math.floor(delay * policy.multiplier));
  return Math.min(policy.maxDelayMs, delay);
}

function sanitizeReceipt(value: unknown): ProviderReceipt {
  if (value === undefined) return Object.freeze({});
  if (!isPlainRecord(value)) throw new RetryOrchestrationError("PROVIDER_INVALID_RESULT", "provider success receipt must be a plain object");
  const receipt: Record<string, string | number | boolean | null> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "string" && typeof item !== "number" && typeof item !== "boolean" && item !== null) {
      throw new RetryOrchestrationError("PROVIDER_INVALID_RESULT", `provider receipt field ${key} is not a scalar`);
    }
    receipt[key] = item;
  }
  return Object.freeze(receipt);
}

function providerResult(value: unknown): ProviderResult {
  if (!isPlainRecord(value) || typeof value.outcome !== "string") throw new RetryOrchestrationError("PROVIDER_INVALID_RESULT", "provider returned an invalid outcome");
  if (value.outcome === "success") return { outcome: "success", receipt: sanitizeReceipt(value.receipt) };
  if (value.outcome === "outage") {
    if (typeof value.reason !== "string" || value.reason.length === 0) throw new RetryOrchestrationError("PROVIDER_INVALID_RESULT", "provider outage lacks a reason");
    const code = typeof value.code === "string" ? value.code : null;
    return code === null ? { outcome: "outage", reason: value.reason } : { outcome: "outage", code, reason: value.reason };
  }
  if (value.outcome === "permanent-failure") {
    if (typeof value.code !== "string" || value.code.length === 0 || typeof value.reason !== "string" || value.reason.length === 0) {
      throw new RetryOrchestrationError("PROVIDER_INVALID_RESULT", "provider permanent failure lacks a code or reason");
    }
    return { outcome: "permanent-failure", code: value.code, reason: value.reason };
  }
  throw new RetryOrchestrationError("PROVIDER_INVALID_RESULT", `unsupported provider outcome ${value.outcome}`);
}

export function retryBackoffDelay(policy: RetryPolicy, failedAttempt: number): number {
  const normalized = normalizePolicy(policy);
  if (!Number.isSafeInteger(failedAttempt) || failedAttempt < 1) throw new RetryOrchestrationError("INVALID_ATTEMPT", "failedAttempt must be a positive integer");
  return delayFor(normalized, failedAttempt);
}

export class RetryOrchestrator {
  private readonly defaultPolicy: RetryPolicy;
  private readonly jobs = new Map<string, RetryJob>();
  private readonly deliveries = new Map<string, DeliveryReceipt>();
  private readonly deadLetters = new Map<string, DeadLetterRecord>();
  private readonly handoffs = new Map<string, ReplayRequiredHandoff>();

  public constructor(options: { readonly defaultPolicy?: RetryPolicy } = {}) {
    this.defaultPolicy = normalizePolicy(options.defaultPolicy);
  }

  public static fromSerialized(input: unknown, options: { readonly defaultPolicy?: RetryPolicy } = {}): RetryOrchestrator {
    if (typeof input !== "string") throw new RetryOrchestrationError("INVALID_SNAPSHOT", "retry snapshot must be a JSON string");
    let parsed: unknown;
    try {
      parsed = JSON.parse(input) as unknown;
    } catch {
      throw new RetryOrchestrationError("INVALID_SNAPSHOT", "retry snapshot is not valid JSON");
    }
    if (!isPlainRecord(parsed) || parsed.schemaVersion !== SLICE_C_SCHEMA_VERSION) {
      throw new RetryOrchestrationError("INVALID_SNAPSHOT", "unsupported retry snapshot schema");
    }
    const jobs = parsed.jobs;
    const deliveries = parsed.deliveries;
    const deadLetters = parsed.deadLetters;
    const handoffs = parsed.handoffs;
    if (!Array.isArray(jobs) || !Array.isArray(deliveries) || !Array.isArray(deadLetters) || !Array.isArray(handoffs)) {
      throw new RetryOrchestrationError("INVALID_SNAPSHOT", "retry snapshot collections must be arrays");
    }
    const restored = new RetryOrchestrator(options);
    const jobIds = new Set<string>();
    for (const raw of jobs) {
      validateRetryJobSnapshot(raw);
      if (!isPlainRecord(raw) || typeof raw.id !== "string" || jobIds.has(raw.id) || !isPlainRecord(raw.selector) || !isPlainRecord(raw.source) || !isPlainRecord(raw.policy)) {
        throw new RetryOrchestrationError("INVALID_SNAPSHOT", "retry snapshot contains an invalid or duplicate job");
      }
      if (typeof raw.attempts !== "number" || !Number.isSafeInteger(raw.attempts) || raw.attempts < 0 || typeof raw.nextAttemptAt !== "number" || !Number.isFinite(raw.nextAttemptAt) || raw.nextAttemptAt < 0) {
        throw new RetryOrchestrationError("INVALID_SNAPSHOT", "retry snapshot contains invalid job counters");
      }
      const policy = normalizePolicy(raw.policy as unknown as RetryPolicy);
      const job = Object.freeze({
        ...raw,
        policy,
        selector: Object.freeze({ ...raw.selector }),
        source: Object.freeze({
          ...raw.source,
          cursor: isPlainRecord(raw.source.cursor) ? Object.freeze({ ...raw.source.cursor }) : raw.source.cursor,
          status: isPlainRecord(raw.source.status) ? Object.freeze({ ...raw.source.status }) : raw.source.status,
        }),
        deliveryIds: Array.isArray(raw.deliveryIds) ? Object.freeze([...raw.deliveryIds]) : raw.deliveryIds,
      }) as unknown as RetryJob;
      jobIds.add(raw.id);
      restored.jobs.set(raw.id, job);
    }
    const deliveryIds = new Set<string>();
    for (const raw of deliveries) {
      if (!isPlainRecord(raw) || typeof raw.deliveryId !== "string" || deliveryIds.has(raw.deliveryId) || (raw.jobId !== null && typeof raw.jobId !== "string") || typeof raw.requestHash !== "string") {
        throw new RetryOrchestrationError("INVALID_SNAPSHOT", "retry snapshot contains an invalid or duplicate delivery");
      }
      if (raw.jobId !== null && !jobIds.has(raw.jobId)) throw new RetryOrchestrationError("INVALID_SNAPSHOT", "delivery references a missing job");
      deliveryIds.add(raw.deliveryId);
      restored.deliveries.set(raw.deliveryId, Object.freeze({ ...raw }) as unknown as DeliveryReceipt);
    }
    const deadLetterIds = new Set<string>();
    for (const raw of deadLetters) {
      if (!isPlainRecord(raw) || typeof raw.id !== "string" || deadLetterIds.has(raw.id)) throw new RetryOrchestrationError("INVALID_SNAPSHOT", "retry snapshot contains an invalid or duplicate dead letter");
      deadLetterIds.add(raw.id);
      restored.deadLetters.set(raw.id, Object.freeze({ ...raw }) as unknown as DeadLetterRecord);
    }
    const handoffIds = new Set<string>();
    for (const raw of handoffs) {
      if (!isPlainRecord(raw) || typeof raw.id !== "string" || handoffIds.has(raw.id)) throw new RetryOrchestrationError("INVALID_SNAPSHOT", "retry snapshot contains an invalid or duplicate handoff");
      handoffIds.add(raw.id);
      restored.handoffs.set(raw.id, Object.freeze({ ...raw }) as unknown as ReplayRequiredHandoff);
    }
    return restored;
  }

  public submit(request: RetryRequest): DeliveryResult {
    let input: InputRecord;
    try {
      input = requestRecord(request);
    } catch (error) {
      const normalizedError = this.normalizeError(error);
      const deliveryId = "invalid-delivery";
      const requestHash = identityHash({ version: "slice-c-invalid-request-v1", deliveryId, code: normalizedError.code });
      const deadLetter = this.addDeadLetter({
        kind: "DELIVERY",
        jobId: null,
        deliveryId,
        relationshipId: null,
        recordKind: null,
        recordId: null,
        snapshotHash: null,
        code: normalizedError.code,
        reason: normalizedError.message,
        attempts: 0,
        nextAction: "submit a plain serialized read-only request",
        sourceStatus: {},
      });
      const receipt = Object.freeze({ deliveryId, jobId: null, requestHash, disposition: "REJECTED" as const, reason: normalizedError.message });
      this.deliveries.set(deliveryId, receipt);
      return { disposition: "REJECTED", job: null, receipt, deadLetter };
    }
    const deliveryId = safeDeliveryId(input);
    let policy: RetryPolicy | null = null;
    let normalizedSelector: { kind: RetryRequest["selector"]["kind"]; id: string } | null = safeSelector(input);
    try {
      policy = normalizePolicy((input.policy as RetryPolicy | undefined) ?? this.defaultPolicy);
    } catch {
      policy = null;
    }
    let requestHash: string;
    try {
      requestHash = requestHashFor(input, policy, normalizedSelector);
    } catch (error) {
      const normalizedError = this.normalizeError(error);
      requestHash = identityHash({
        version: "slice-c-invalid-delivery-v1",
        deliveryId,
        selector: normalizedSelector,
        relationshipId: safeScope(input),
        provider: typeof input.provider === "string" ? input.provider : null,
        operation: typeof input.operation === "string" ? input.operation : null,
        code: normalizedError.code,
      });
      const deadLetter = this.addDeadLetter({
        kind: "DELIVERY",
        jobId: null,
        deliveryId,
        relationshipId: safeScope(input),
        recordKind: normalizedSelector?.kind ?? null,
        recordId: normalizedSelector?.id ?? null,
        snapshotHash: this.safeContractHash(input),
        code: normalizedError.code,
        reason: normalizedError.message,
        attempts: 0,
        nextAction: "repair the serialized request and redeliver the read-only job",
        sourceStatus: {},
      });
      const receipt = Object.freeze({ deliveryId, jobId: null, requestHash, disposition: "REJECTED" as const, reason: normalizedError.message });
      this.deliveries.set(deliveryId, receipt);
      return { disposition: "REJECTED", job: null, receipt, deadLetter };
    }
    const previous = this.deliveries.get(deliveryId);
    if (previous) {
      if (previous.requestHash === requestHash) {
        return { disposition: "DUPLICATE", job: previous.jobId === null ? null : this.jobs.get(previous.jobId) ?? null, receipt: Object.freeze({ ...previous, disposition: "DUPLICATE", reason: "duplicate delivery" }), deadLetter: this.deadLetterForRequest(requestHash) };
      }
      const deadLetter = this.addDeadLetter({
        kind: "DELIVERY",
        jobId: previous.jobId,
        deliveryId,
        relationshipId: safeScope(input),
        recordKind: normalizedSelector?.kind ?? null,
        recordId: normalizedSelector?.id ?? null,
        snapshotHash: this.safeContractHash(input),
        code: "DELIVERY_ID_CONFLICT",
        reason: "delivery ID was reused with a different serialized request",
        attempts: 0,
        nextAction: "inspect delivery identity and submit an unmodified request",
        sourceStatus: {},
      });
      return { disposition: "REJECTED", job: previous.jobId === null ? null : this.jobs.get(previous.jobId) ?? null, receipt: Object.freeze({ deliveryId, jobId: previous.jobId, requestHash, disposition: "REJECTED", reason: "delivery ID conflict" }), deadLetter };
    }

    try {
      if (policy === null) throw new RetryOrchestrationError("INVALID_POLICY", "retry policy is invalid");
      const deliveryRequest = this.validateRequest(input);
      normalizedSelector = deliveryRequest.selector;
      const parsed = parseSerializedSliceBContract(deliveryRequest.contract);
      const record = selectContractRecord(parsed, deliveryRequest.selector, deliveryRequest.relationshipId);
      if (deliveryRequest.operation === "replay-required-handoff") requireReplayRequired(record);
      const normalizedRecordSelector = { kind: record.kind, id: record.id } as RetryRequest["selector"];
      const jobIdentity = {
        version: "slice-c-job-v1",
        sourceHash: parsed.hash,
        selector: normalizedRecordSelector,
        relationshipId: deliveryRequest.relationshipId,
        provider: deliveryRequest.provider,
        operation: deliveryRequest.operation,
        policy,
      };
      const jobId = `retry-job:${identityHash(jobIdentity)}`;
      const existing = this.jobs.get(jobId);
      if (existing) {
        const next = Object.freeze({ ...existing, deliveryIds: Object.freeze([...new Set([...existing.deliveryIds, deliveryId])].sort()) });
        this.jobs.set(jobId, next);
        const receipt = Object.freeze({ deliveryId, jobId, requestHash, disposition: "DUPLICATE" as const, reason: "job already accepted" });
        this.deliveries.set(deliveryId, receipt);
        return { disposition: "DUPLICATE", job: next, receipt, deadLetter: null };
      }
      const job: RetryJob = Object.freeze({
        id: jobId,
        provider: deliveryRequest.provider,
        operation: deliveryRequest.operation,
        selector: Object.freeze(normalizedRecordSelector),
        relationshipId: deliveryRequest.relationshipId,
        source: sourceView(parsed, record),
        policy,
        status: "PENDING",
        attempts: 0,
        nextAttemptAt: 0,
        lastError: null,
        result: null,
        deliveryIds: Object.freeze([deliveryId]),
        handoffId: null,
      });
      this.jobs.set(jobId, job);
      const receipt = Object.freeze({ deliveryId, jobId, requestHash, disposition: "ACCEPTED" as const, reason: null });
      this.deliveries.set(deliveryId, receipt);
      return { disposition: "ACCEPTED", job, receipt, deadLetter: null };
    } catch (error) {
      const normalizedError = this.normalizeError(error);
      const deadLetter = this.addDeadLetter({
        kind: errorKind(normalizedError.code),
        jobId: null,
        deliveryId,
        relationshipId: safeScope(input),
        recordKind: normalizedSelector?.kind ?? null,
        recordId: normalizedSelector?.id ?? null,
        snapshotHash: this.safeContractHash(input),
        code: normalizedError.code,
        reason: normalizedError.message,
        attempts: 0,
        nextAction: "repair the serialized contract or request and redeliver the read-only job",
        sourceStatus: {},
      });
      const receipt = Object.freeze({ deliveryId, jobId: null, requestHash, disposition: "REJECTED" as const, reason: normalizedError.message });
      this.deliveries.set(deliveryId, receipt);
      return { disposition: "REJECTED", job: null, receipt, deadLetter };
    }
  }

  public operatorReplay(jobId: string): RetryJob {
    if (typeof jobId !== "string" || jobId.length === 0) throw new RetryOrchestrationError("INVALID_REPLAY", "operator replay requires a job ID");
    const job = this.jobs.get(jobId);
    if (!job) throw new RetryOrchestrationError("REPLAY_JOB_NOT_FOUND", "operator replay job was not found");
    if (job.status !== "DEAD_LETTERED") throw new RetryOrchestrationError("REPLAY_NOT_TERMINAL", "operator replay requires a dead-lettered job");
    return this.updateJob(job, {
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: 0,
      lastError: null,
      result: null,
      handoffId: null,
    });
  }

  public executeNext(provider: ReadOnlyProvider | null, now = 0): ExecutionResult {
    const effectiveNow = typeof now === "number" && Number.isFinite(now) && now >= 0 ? now : 0;
    const job = [...this.jobs.values()].filter((candidate) => ready(candidate, effectiveNow)).sort(compareJobs)[0];
    if (!job) return { outcome: "IDLE", job: null, deadLetter: null, handoff: null };

    if (job.operation === "replay-required-handoff") return this.executeHandoff(job);

    let outcome: ProviderResult;
    try {
      outcome = provider === null ? { outcome: "outage", code: "PROVIDER_UNAVAILABLE", reason: "no read-only provider was supplied" } : providerResult(provider.read(job));
    } catch (error) {
      const normalizedError = this.normalizeError(error);
      outcome = { outcome: "outage", code: normalizedError.code, reason: normalizedError.message };
    }
    const attempts = job.attempts + 1;
    if (outcome.outcome === "success") {
      const updated = this.updateJob(job, { status: "COMPLETED", attempts, nextAttemptAt: effectiveNow, lastError: null, result: outcome.receipt ?? Object.freeze({}) });
      return { outcome: "COMPLETED", job: updated, deadLetter: null, handoff: null };
    }
    if (outcome.outcome === "outage" && attempts < job.policy.maxAttempts) {
      const updated = this.updateJob(job, { status: "RETRY_SCHEDULED", attempts, nextAttemptAt: effectiveNow + delayFor(job.policy, attempts), lastError: outcome.reason, result: null });
      return { outcome: "RETRY_SCHEDULED", job: updated, deadLetter: null, handoff: null };
    }

    const code = outcome.outcome === "outage" ? "PROVIDER_OUTAGE_EXHAUSTED" : outcome.code;
    const reason = outcome.reason;
    const deadLetter = this.addDeadLetter({
      kind: "PROVIDER",
      jobId: job.id,
      deliveryId: job.deliveryIds[0] ?? null,
      relationshipId: job.relationshipId,
      recordKind: job.source.recordKind,
      recordId: job.source.recordId,
      snapshotHash: job.source.snapshotHash,
      code,
      reason,
      attempts,
      nextAction: outcome.outcome === "outage" ? "inspect provider availability and redeliver the read-only job" : "correct the provider response and redeliver the read-only job",
      sourceStatus: job.source.status,
    });
    const updated = this.updateJob(job, { status: "DEAD_LETTERED", attempts, nextAttemptAt: effectiveNow, lastError: reason, result: null });
    return { outcome: "DEAD_LETTERED", job: updated, deadLetter, handoff: null };
  }

  public executeReady(provider: ReadOnlyProvider | null, now = 0, limit = MAX_BATCH_SIZE): readonly ExecutionResult[] {
    const boundedLimit = typeof limit === "number" && Number.isSafeInteger(limit) && limit >= 0 ? Math.min(limit, MAX_BATCH_SIZE) : 0;
    const results: ExecutionResult[] = [];
    for (let index = 0; index < boundedLimit; index += 1) {
      const result = this.executeNext(provider, now);
      if (result.outcome === "IDLE") break;
      results.push(result);
    }
    return Object.freeze(results);
  }

  public snapshot(): RetryOrchestrationSnapshot {
    return Object.freeze({
      schemaVersion: SLICE_C_SCHEMA_VERSION,
      jobs: Object.freeze([...this.jobs.values()].sort(compareJobs)),
      deliveries: Object.freeze([...this.deliveries.values()].sort((left, right) => left.deliveryId.localeCompare(right.deliveryId))),
      deadLetters: Object.freeze([...this.deadLetters.values()].sort((left, right) => left.id.localeCompare(right.id))),
      handoffs: Object.freeze([...this.handoffs.values()].sort((left, right) => left.id.localeCompare(right.id))),
    });
  }

  public serialize(): string {
    return JSON.stringify(this.snapshot());
  }

  private validateRequest(input: InputRecord): RetryRequest {
    const deliveryId = requiredString(input.deliveryId, "deliveryId");
    const contract = input.contract;
    if (!isPlainRecord(contract)) throw new RetryOrchestrationError("INVALID_REQUEST", "contract must be a serialized Slice B contract envelope");
    const hash = requiredString(contract.hash, "contract.hash");
    const body = requiredString(contract.body, "contract.body");
    const selectorValue = input.selector;
    if (!isPlainRecord(selectorValue)) throw new RetryOrchestrationError("INVALID_REQUEST", "selector must be an object");
    const kind = requiredString(selectorValue.kind, "selector.kind") as RetryRequest["selector"]["kind"];
    const id = requiredString(selectorValue.id, "selector.id");
    const relationship = scopeValue(input.relationshipId);
    const provider = requiredString(input.provider, "provider");
    const operation = input.operation;
    if (operation !== "provider-read" && operation !== "replay-required-handoff") throw new RetryOrchestrationError("INVALID_REQUEST", "operation is not supported");
    return { deliveryId, contract: { hash, body }, selector: { kind, id }, relationshipId: relationship, provider, operation, policy: normalizePolicy((input.policy as RetryPolicy | undefined) ?? this.defaultPolicy) };
  }

  private updateJob(job: RetryJob, patch: Partial<Pick<RetryJob, "status" | "attempts" | "nextAttemptAt" | "lastError" | "result" | "handoffId">>): RetryJob {
    const updated = Object.freeze({ ...job, ...patch });
    this.jobs.set(job.id, updated);
    return updated;
  }

  private executeHandoff(job: RetryJob): ExecutionResult {
    if (job.source.replay === null || job.source.status.replayStatus !== "REPLAY_REQUIRED") {
      const deadLetter = this.addDeadLetter({
        kind: "REPLAY",
        jobId: job.id,
        deliveryId: job.deliveryIds[0] ?? null,
        relationshipId: job.relationshipId,
        recordKind: job.source.recordKind,
        recordId: job.source.recordId,
        snapshotHash: job.source.snapshotHash,
        code: "REPLAY_METADATA_UNAVAILABLE",
        reason: "serialized checkpoint lacks replay metadata",
        attempts: job.attempts + 1,
        nextAction: "supply replay metadata in the serialized Slice B contract",
        sourceStatus: job.source.status,
      });
      const updated = this.updateJob(job, { status: "DEAD_LETTERED", attempts: job.attempts + 1, nextAttemptAt: 0, lastError: "serialized checkpoint lacks replay metadata", result: null });
      return { outcome: "DEAD_LETTERED", job: updated, deadLetter, handoff: null };
    }
    const replay = job.source.replay;
    const chainKey = job.source.cursor.chainKey;
    if (chainKey === null) {
      const deadLetter = this.addDeadLetter({
        kind: "REPLAY",
        jobId: job.id,
        deliveryId: job.deliveryIds[0] ?? null,
        relationshipId: job.relationshipId,
        recordKind: job.source.recordKind,
        recordId: job.source.recordId,
        snapshotHash: job.source.snapshotHash,
        code: "REPLAY_CHAIN_SCOPE_UNAVAILABLE",
        reason: "serialized checkpoint lacks chain scope",
        attempts: job.attempts + 1,
        nextAction: "verify checkpoint chain scope before replay handoff",
        sourceStatus: job.source.status,
      });
      const updated = this.updateJob(job, { status: "DEAD_LETTERED", attempts: job.attempts + 1, nextAttemptAt: 0, lastError: "serialized checkpoint lacks chain scope", result: null });
      return { outcome: "DEAD_LETTERED", job: updated, deadLetter, handoff: null };
    }
    const handoff: ReplayRequiredHandoff = Object.freeze({
      id: `replay-handoff:${identityHash({ sourceSnapshotHash: job.source.snapshotHash, chainKey, replay })}`,
      status: "REPLAY_REQUIRED",
      relationshipId: null,
      chainKey,
      sourceSnapshotHash: job.source.snapshotHash,
      replaySequence: replay.replaySequence,
      replayFromBlock: replay.replayFromBlock,
      replayOldBlockHash: replay.replayOldBlockHash,
      replayParentBlockHash: replay.replayParentBlockHash,
      replayTargets: Object.freeze(replay.replayTargets.map((target) => Object.freeze({ ...target }))),
      recoveryRole: "projection operator",
      nextAction: job.source.status.replayNextAction ?? "submit a finalized replacement observation through the Slice B replay boundary",
      authority: "projection",
    });
    this.handoffs.set(handoff.id, handoff);
    const updated = this.updateJob(job, { status: "HANDOFF_EMITTED", attempts: job.attempts + 1, nextAttemptAt: 0, lastError: null, result: null, handoffId: handoff.id });
    return { outcome: "HANDOFF_EMITTED", job: updated, deadLetter: null, handoff };
  }

  private addDeadLetter(input: Omit<DeadLetterRecord, "id" | "status" | "recoveryRole">): DeadLetterRecord {
    const id = `dead-letter:${identityHash(input)}`;
    const existing = this.deadLetters.get(id);
    if (existing) return existing;
    const record: DeadLetterRecord = Object.freeze({ ...input, id, status: "DEAD_LETTER", recoveryRole: "retry-orchestration-operator", sourceStatus: cloneStatus(input.sourceStatus) });
    this.deadLetters.set(id, record);
    return record;
  }

  private deadLetterForRequest(requestHash: string): DeadLetterRecord | null {
    return [...this.deadLetters.values()].find((record) => identityHash({
      deliveryId: record.deliveryId,
      code: record.code,
      reason: record.reason,
      snapshotHash: record.snapshotHash,
    }) === requestHash) ?? null;
  }

  private safeContractHash(input: InputRecord): string | null {
    return isPlainRecord(input.contract) && typeof input.contract.hash === "string" ? input.contract.hash : null;
  }

  private normalizeError(error: unknown): { readonly code: string; readonly message: string } {
    if (error instanceof ContractError) return { code: error.code, message: error.message };
    if (error instanceof RetryOrchestrationError) return { code: error.code, message: error.message };
    if (error instanceof Error) return { code: "INVALID_REQUEST", message: error.message || "invalid request" };
    return { code: "INVALID_REQUEST", message: "invalid request" };
  }
}

export class ProviderOutageSimulator implements ReadOnlyProvider {
  private remainingFailures: number;
  private readonly provider: string | null;
  private readonly alwaysOutage: boolean;
  private readonly reason: string;

  public constructor(options: ProviderOutageSimulatorOptions = {}) {
    if (options.provider !== undefined && (typeof options.provider !== "string" || options.provider.length === 0)) throw new RetryOrchestrationError("INVALID_PROVIDER_SIMULATOR", "provider filter must be a nonempty string");
    const failuresBeforeSuccess = options.failuresBeforeSuccess ?? 0;
    if (!Number.isSafeInteger(failuresBeforeSuccess) || failuresBeforeSuccess < 0 || failuresBeforeSuccess > MAX_ATTEMPTS) throw new RetryOrchestrationError("INVALID_PROVIDER_SIMULATOR", `failuresBeforeSuccess must be an integer from 0 to ${MAX_ATTEMPTS}`);
    if (options.alwaysOutage !== undefined && typeof options.alwaysOutage !== "boolean") throw new RetryOrchestrationError("INVALID_PROVIDER_SIMULATOR", "alwaysOutage must be boolean");
    if (options.reason !== undefined && (typeof options.reason !== "string" || options.reason.length === 0)) throw new RetryOrchestrationError("INVALID_PROVIDER_SIMULATOR", "reason must be a nonempty string");
    this.remainingFailures = failuresBeforeSuccess;
    this.provider = options.provider ?? null;
    this.alwaysOutage = options.alwaysOutage ?? false;
    this.reason = options.reason ?? "simulated provider outage";
  }

  public read(job: Readonly<RetryJob>): ProviderResult {
    if (this.provider !== null && job.provider !== this.provider) return { outcome: "success", receipt: { provider: job.provider, operation: "read-only", jobId: job.id, attempt: job.attempts + 1 } };
    if (this.alwaysOutage || this.remainingFailures > 0) {
      if (this.remainingFailures > 0) this.remainingFailures -= 1;
      return { outcome: "outage", code: "PROVIDER_OUTAGE", reason: this.reason };
    }
    return { outcome: "success", receipt: { provider: job.provider, operation: "read-only", jobId: job.id, attempt: job.attempts + 1 } };
  }
}

export function createProviderOutageSimulator(options: ProviderOutageSimulatorOptions = {}): ProviderOutageSimulator {
  return new ProviderOutageSimulator(options);
}
