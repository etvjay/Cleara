import { createHash } from "node:crypto";
import {
  manifestHashForBody,
  parseSourceScopeManifest,
  serializeSourceScopeManifest,
  type SourceScopeManifest,
} from "../../source-scope/src/manifest.js";
import { loadCanonicalD0Manifest } from "./canonical-manifest.js";
import { isPlainRecord, isSafeArray, isStructuredCloneable } from "../../source-scope/src/safety.js";
import type { ObservationEnvelope } from "../../../multichain-execution/src/slice-b.js";
import type { SerializedSliceBSnapshot } from "../../../slice-c/durable-storage/src/index.js";
import {
  CapitalCommittedAdapter,
  validateBlock,
  validateLog,
} from "./adapter.js";
import { asProviderError, SourceIngestionError } from "./errors.js";
import type { SourceReadProvider } from "./provider.js";
import {
  SliceBSerializedBoundary,
} from "./slice-b-boundary.js";
import type {
  AcceptedEventRecord,
  BackfillRetryStatus,
  BackfillStatusMarker,
  BackfillCursor,
  BackfillRequest,
  BackfillResult,
  DuplicateEventRecord,
  NormalizedSourceObservation,
  ProviderErrorRecord,
  RejectedEventRecord,
  RetrySummary,
  SerializedBackfillState,
  SourceBackfillOptions,
  SourceBlockHeader,
  SourceLog,
} from "./types.js";

const RECOVERABLE = new Set(["TIMEOUT", "OUTAGE", "RATE_LIMIT", "NOT_FOUND"]);

type IdentityRecord = Pick<AcceptedEventRecord, "payloadHash" | "blockHash" | "transactionHash" | "transactionIndex" | "logIndex">;

type BlockFailure = {
  readonly method: ProviderErrorRecord["method"];
  readonly error: unknown;
  readonly blockNumber: number | null;
};

function isSafeBlock(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function stateString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", `${field} must be a nonempty trimmed string`);
  return value;
}

function stateHash(value: unknown, field: string, withPrefix = true): string {
  const pattern = withPrefix ? /^0x[0-9a-f]{64}$/ : /^[0-9a-f]{64}$/;
  if (typeof value !== "string" || !pattern.test(value)) throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", `${field} must be a canonical SHA/hash string`);
  return value;
}

function stateInteger(value: unknown, field: string): number {
  if (!isSafeBlock(value)) throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", `${field} must be a safe nonnegative integer`);
  return value;
}

function exactStateKeys(value: Record<string, unknown>, expected: readonly string[], field: string): void {
  const actual = Object.keys(value).sort();
  const target = [...expected].sort();
  if (actual.length !== target.length || actual.some((key, index) => key !== target[index])) throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", `${field} has an unsupported shape`);
}

function validateAcceptedRecord(value: unknown, field: string): void {
  if (!isPlainRecord(value)) throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", `${field} must be a plain object`);
  exactStateKeys(value, ["eventId", "sourceEventId", "observationId", "relationshipId", "objectId", "blockNumber", "blockHash", "transactionHash", "transactionIndex", "logIndex", "eventIndex", "payloadHash", "finalityState", "evidenceStatus", "reconciliationStatus"], field);
  for (const key of ["eventId", "sourceEventId", "observationId", "relationshipId", "objectId", "evidenceStatus", "reconciliationStatus"]) stateString(value[key], `${field}.${key}`);
  if (value.evidenceStatus !== "PENDING_PROOF" || value.reconciliationStatus !== "RECONCILIATION_PENDING") throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", `${field} status axes are unsupported`);
  stateInteger(value.blockNumber, `${field}.blockNumber`);
  stateHash(value.blockHash, `${field}.blockHash`);
  stateHash(value.transactionHash, `${field}.transactionHash`);
  for (const key of ["transactionIndex", "logIndex", "eventIndex"]) stateInteger(value[key], `${field}.${key}`);
  if (value.logIndex !== value.eventIndex) throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", `${field}.logIndex must equal eventIndex`);
  stateHash(value.payloadHash, `${field}.payloadHash`, false);
  if (typeof value.finalityState !== "string" || !["UNKNOWN", "FINALITY_PENDING", "FINALIZED", "REORGED"].includes(value.finalityState)) throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", `${field}.finalityState is unsupported`);
  if (value.eventId !== value.observationId) throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", `${field}.eventId must equal observationId`);
}

function validateRejectedRecord(value: unknown, field: string): void {
  if (!isPlainRecord(value)) throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", `${field} must be a plain object`);
  exactStateKeys(value, ["eventId", "blockNumber", "transactionHash", "logIndex", "code", "reason"], field);
  stateString(value.eventId, `${field}.eventId`);
  stateInteger(value.blockNumber, `${field}.blockNumber`);
  stateHash(value.transactionHash, `${field}.transactionHash`);
  stateInteger(value.logIndex, `${field}.logIndex`);
  stateString(value.code, `${field}.code`);
  stateString(value.reason, `${field}.reason`);
}

function validateDuplicateRecord(value: unknown, field: string): void {
  if (!isPlainRecord(value)) throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", `${field} must be a plain object`);
  exactStateKeys(value, ["eventId", "payloadHash", "disposition"], field);
  stateString(value.eventId, `${field}.eventId`);
  stateHash(value.payloadHash, `${field}.payloadHash`, false);
  if (value.disposition !== "NOOP") throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", `${field}.disposition is unsupported`);
}

function validateProviderErrorRecord(value: unknown, field: string): void {
  if (!isPlainRecord(value)) throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", `${field} must be a plain object`);
  exactStateKeys(value, ["method", "code", "reason", "blockNumber", "recoverable"], field);
  if (!["getChainIdentity", "getLatestBlockNumber", "getBlockHeader", "getLogs", "getTransactionReceipt", "checkpoint", "retry"].includes(String(value.method))) throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", `${field}.method is unsupported`);
  stateString(value.code, `${field}.code`);
  stateString(value.reason, `${field}.reason`);
  if (value.blockNumber !== null) stateInteger(value.blockNumber, `${field}.blockNumber`);
  if (typeof value.recoverable !== "boolean") throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", `${field}.recoverable must be boolean`);
}

function validateStateEnvelope(value: unknown, manifestHash: string, scopeId: string): asserts value is SerializedBackfillState {
  if (!isPlainRecord(value)) throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", "backfill state must be a plain object");
  exactStateKeys(value, ["acceptedEvents", "cursor", "duplicateEvents", "manifestHash", "providerErrors", "rejectedEvents", "schemaVersion", "snapshot"], "backfill state");
  if (value.schemaVersion !== "slice-d-source-ingestion-v1" || value.manifestHash !== manifestHash) throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", "backfill state schema or manifest binding is invalid");
  stateHash(value.manifestHash, "backfill state manifestHash", false);
  if (!isSafeArray(value.acceptedEvents) || !isSafeArray(value.rejectedEvents) || !isSafeArray(value.duplicateEvents) || !isSafeArray(value.providerErrors)) throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", "backfill state collections must be dense safe arrays");
  const acceptedEventIds = new Set<string>();
  const acceptedCoordinates = new Set<string>();
  value.acceptedEvents.forEach((raw, index) => {
    validateAcceptedRecord(raw, `acceptedEvents[${index}]`);
    const item = raw as AcceptedEventRecord;
    if (acceptedEventIds.has(item.eventId)) throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", "backfill state has duplicate accepted event IDs");
    const coordinateKey = `${item.transactionHash}:${item.eventIndex}`;
    if (acceptedCoordinates.has(coordinateKey)) throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", "backfill state has duplicate accepted source coordinates");
    acceptedEventIds.add(item.eventId);
    acceptedCoordinates.add(coordinateKey);
  });
  value.rejectedEvents.forEach((item, index) => validateRejectedRecord(item, `rejectedEvents[${index}]`));
  value.duplicateEvents.forEach((item, index) => validateDuplicateRecord(item, `duplicateEvents[${index}]`));
  value.providerErrors.forEach((item, index) => validateProviderErrorRecord(item, `providerErrors[${index}]`));
  if (value.snapshot !== null) {
    if (!isPlainRecord(value.snapshot)) throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", "backfill state snapshot envelope is invalid");
    exactStateKeys(value.snapshot, ["body", "hash"], "backfill state snapshot");
    stateString(value.snapshot.body, "backfill state snapshot.body");
    stateHash(value.snapshot.hash, "backfill state snapshot.hash", false);
  }
  if (value.cursor !== null) {
    if (!isPlainRecord(value.cursor)) throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", "backfill state cursor is invalid");
    exactStateKeys(value.cursor, ["lastCompletedBlock", "nextBlock", "requestedEnd", "requestedStart", "scope", "sequence", "mode"], "backfill state cursor");
    if (value.cursor.scope !== scopeId || value.cursor.mode !== "SPARSE_EVENT") throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", "backfill state cursor scope or mode is invalid");
    stateInteger(value.cursor.requestedStart, "backfill state cursor requestedStart");
    stateInteger(value.cursor.requestedEnd, "backfill state cursor requestedEnd");
    stateInteger(value.cursor.nextBlock, "backfill state cursor nextBlock");
    stateInteger(value.cursor.sequence, "backfill state cursor sequence");
    if (value.cursor.lastCompletedBlock !== null) stateInteger(value.cursor.lastCompletedBlock, "backfill state cursor lastCompletedBlock");
  }
}


function canonicalJson(value: unknown, ancestors = new Set<object>()): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new SourceIngestionError("UNSAFE_INPUT", "state contains a non-finite number");
    return JSON.stringify(value);
  }
  if (ancestors.has(value)) throw new SourceIngestionError("UNSAFE_INPUT", "state contains a cycle");
  const next = new Set(ancestors).add(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item, next)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key], next)}`).join(",")}}`;
}

function sortedAccepted(values: Iterable<AcceptedEventRecord>): AcceptedEventRecord[] {
  return [...values].sort((left, right) => left.blockNumber - right.blockNumber || left.transactionIndex - right.transactionIndex || left.logIndex - right.logIndex || left.eventId.localeCompare(right.eventId));
}

function sortedRejected(values: readonly RejectedEventRecord[]): RejectedEventRecord[] {
  return [...values].sort((left, right) => left.blockNumber - right.blockNumber || left.logIndex - right.logIndex || left.eventId.localeCompare(right.eventId) || left.code.localeCompare(right.code));
}

function sortedDuplicates(values: readonly DuplicateEventRecord[]): DuplicateEventRecord[] {
  return [...values].sort((left, right) => left.eventId.localeCompare(right.eventId) || left.payloadHash.localeCompare(right.payloadHash));
}

function hashState(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function eventIdentityKey(event: NormalizedSourceObservation): string {
  return `${event.coordinates.transactionHash}:${event.coordinates.eventIndex}`;
}

function observationSummary(event: NormalizedSourceObservation, finalizedHeight: number): AcceptedEventRecord {
  return Object.freeze({
    eventId: event.observationId,
    sourceEventId: event.sourceEventId,
    observationId: event.observationId,
    relationshipId: event.observation.relationshipId,
    objectId: event.observation.objectId,
    blockNumber: event.coordinates.blockNumber,
    blockHash: event.coordinates.blockHash,
    transactionHash: event.coordinates.transactionHash,
    transactionIndex: event.coordinates.transactionIndex,
    logIndex: event.coordinates.logIndex,
    eventIndex: event.coordinates.eventIndex,
    payloadHash: event.payloadHash,
    finalityState: event.coordinates.blockNumber <= finalizedHeight ? "FINALIZED" : "FINALITY_PENDING",
    evidenceStatus: "PENDING_PROOF",
    reconciliationStatus: "RECONCILIATION_PENDING",
  });
}

function withFinality(record: AcceptedEventRecord, finalizedHeight: number): AcceptedEventRecord {
  return Object.freeze({ ...record, finalityState: record.blockNumber <= finalizedHeight ? "FINALIZED" : "FINALITY_PENDING" });
}

function parseReplayHistory(snapshot: SerializedSliceBSnapshot | null): readonly Record<string, unknown>[] {
  if (!snapshot) return [];
  try {
    const parsed = JSON.parse(snapshot.body) as { replayHistory?: unknown };
    return Array.isArray(parsed.replayHistory) ? parsed.replayHistory.filter((item): item is Record<string, unknown> => item !== null && typeof item === "object" && !Array.isArray(item)).map((item) => ({ ...item })) : [];
  } catch {
    return [];
  }
}

function finalizedHeight(snapshot: SerializedSliceBSnapshot | null, c: SourceBackfillOptions["c"], manifest: SourceScopeManifest): number | null {
  if (!snapshot) return null;
  const checkpoint = c.read(snapshot).checkpoint(manifest.chainKey);
  if (!checkpoint || checkpoint.lastFinalizedBlock === null) return null;
  const value = Number(checkpoint.lastFinalizedBlock);
  return Number.isSafeInteger(value) ? value : null;
}

function observedHeight(values: Iterable<AcceptedEventRecord>): number | null {
  const numbers = [...values].map((item) => item.blockNumber);
  return numbers.length === 0 ? null : Math.max(...numbers);
}

function earliestCanonicalHeaderBlock(snapshot: SerializedSliceBSnapshot | null, manifest: SourceScopeManifest): number | null {
  if (!snapshot) return null;
  try {
    const parsed = JSON.parse(snapshot.body) as { blockHistory?: unknown };
    if (!Array.isArray(parsed.blockHistory)) return null;
    const blocks: number[] = [];
    for (const entry of parsed.blockHistory) {
      if (!Array.isArray(entry) || entry.length !== 2 || entry[0] === undefined || entry[1] === null || typeof entry[1] !== "object") continue;
      const header = entry[1] as { chainKey?: unknown; status?: unknown; blockNumber?: unknown };
      if (header.chainKey !== manifest.chainKey || header.status !== "CANONICAL" || typeof header.blockNumber !== "string" || !/^\d+n$/.test(header.blockNumber)) continue;
      const block = BigInt(header.blockNumber.slice(0, -1));
      if (block <= BigInt(Number.MAX_SAFE_INTEGER - 1)) blocks.push(Number(block));
    }
    return blocks.length === 0 ? null : Math.min(...blocks);
  } catch {
    return null;
  }
}

function checkpointState(snapshot: SerializedSliceBSnapshot | null, c: SourceBackfillOptions["c"], manifest: SourceScopeManifest) {
  return snapshot ? c.read(snapshot).checkpoint(manifest.chainKey) : null;
}

function replayDetails(snapshot: SerializedSliceBSnapshot | null, c: SourceBackfillOptions["c"], manifest: SourceScopeManifest): { readonly targets: readonly Record<string, unknown>[]; readonly owner: string | null; readonly recoveryRole: string | null; readonly reason: string | null; readonly nextAction: string | null } {
  const checkpoint = checkpointState(snapshot, c, manifest);
  if (!checkpoint) return { targets: [], owner: null, recoveryRole: null, reason: null, nextAction: null };
  return {
    targets: checkpoint.replayTargets.map((target) => ({ chainKey: target.chainKey, blockNumber: target.blockNumber.toString(10), oldBlockHash: target.oldBlockHash, oldParentBlockHash: target.oldParentBlockHash, expectedParentBlockHash: target.expectedParentBlockHash })),
    owner: checkpoint.replayOwner,
    recoveryRole: checkpoint.replayRecoveryRole,
    reason: checkpoint.replayReason,
    nextAction: checkpoint.replayNextAction,
  };
}

function rejectionId(log: SourceLog): string {
  return `source-coordinate:${log.transactionHash}:${log.logIndex}`;
}

function acceptedMatchesObservation(record: AcceptedEventRecord, value: unknown, manifest: SourceScopeManifest): boolean {
  if (!isPlainRecord(value)) return false;
  if (value.observationId !== record.observationId || value.sourceEventId !== record.sourceEventId || value.relationshipId !== record.relationshipId || value.objectId !== record.objectId || value.objectType !== "Commitment" || value.eventType !== "CapitalCommitted" || value.sourceDomain !== manifest.sourceDomain || value.chainKey !== manifest.chainKey || value.chainId !== manifest.evmChainId || value.adapterVersion !== manifest.adapterVersion || value.payloadSchemaVersion !== manifest.eventFamily.schemaVersion || value.blockHash !== record.blockHash || value.transactionHash !== record.transactionHash || value.transactionIndex !== record.transactionIndex || value.eventIndex !== record.eventIndex) return false;
  if (typeof value.blockNumber !== "bigint" || value.blockNumber !== BigInt(record.blockNumber)) return false;
  if (!isPlainRecord(value.normalizedPayload)) return false;
  const observedPayloadHash = createHash("sha256").update(canonicalJson(value.normalizedPayload), "utf8").digest("hex");
  if (observedPayloadHash !== record.payloadHash) return false;
  if (["CONFLICTING", "MALFORMED", "REJECTED", "UNAVAILABLE"].includes(String(value.observationState))) return false;
  if (record.finalityState === "REORGED") return value.finalityState === "REORGED";
  return value.finalityState === record.finalityState;
}

function publicObservationMatches(normalized: NormalizedSourceObservation, value: unknown): boolean {
  if (!isPlainRecord(value)) return false;
  if (value.observationId !== normalized.observationId || value.sourceEventId !== normalized.sourceEventId || value.relationshipId !== normalized.observation.relationshipId || value.objectId !== normalized.observation.objectId || value.objectType !== normalized.observation.objectType || value.eventType !== normalized.observation.eventType || value.sourceDomain !== normalized.observation.sourceDomain || value.chainKey !== normalized.observation.chainKey || value.chainId !== normalized.observation.chainId || value.contractAddress !== normalized.observation.contractAddress || value.transactionHash !== normalized.observation.transactionHash || value.transactionIndex !== normalized.observation.transactionIndex || value.eventIndex !== normalized.observation.eventIndex || value.blockNumber !== normalized.observation.blockNumber || value.blockHash !== normalized.observation.blockHash || value.parentBlockHash !== normalized.observation.parentBlockHash || value.payloadSchemaVersion !== normalized.observation.payloadSchemaVersion || value.adapterVersion !== normalized.observation.adapterVersion) return false;
  if (!isPlainRecord(value.normalizedPayload)) return false;
  if (createHash("sha256").update(canonicalJson(value.normalizedPayload), "utf8").digest("hex") !== normalized.payloadHash) return false;
  return value.observationState === "OBSERVED" && value.finalityState !== "REORGED";
}
function validateSnapshotBinding(snapshot: SerializedSliceBSnapshot, api: ReturnType<SliceBSerializedBoundary["read"]>, manifest: SourceScopeManifest, cursor: BackfillCursor | null): void {
  const checkpoint = api.checkpoint(manifest.chainKey);
  if (!checkpoint || checkpoint.chainKey !== manifest.chainKey || checkpoint.chainId !== manifest.evmChainId || checkpoint.sourceDomain !== manifest.sourceDomain || checkpoint.adapterVersion !== manifest.adapterVersion || checkpoint.observationSchemaVersion !== manifest.eventFamily.schemaVersion || checkpoint.finalityPolicyVersion !== manifest.finalityPolicy.version || checkpoint.cursorMode !== manifest.cursor.mode || checkpoint.projectionSchemaVersion !== "slice-b-read-model-v1") throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", "serialized Slice B snapshot is not bound to the D0 source descriptor");
  if (cursor) {
    const bootstrapCursor = cursor.lastCompletedBlock === null && BigInt(cursor.nextBlock) === checkpoint.lastObservedBlock;
    const resumedCursor = BigInt(cursor.nextBlock) === checkpoint.lastObservedBlock + 1n && (cursor.lastCompletedBlock === null || BigInt(cursor.lastCompletedBlock) === checkpoint.lastObservedBlock);
    if (!bootstrapCursor && !resumedCursor) throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", "serialized cursor does not match the public Slice B checkpoint");
  }
}
function publicObservationsFromSnapshot(snapshot: SerializedSliceBSnapshot, api: ReturnType<SliceBSerializedBoundary["read"]>): readonly unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(snapshot.body) as unknown;
  } catch {
    throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", "serialized Slice B snapshot observations are not valid JSON");
  }
  if (!isPlainRecord(parsed) || !isSafeArray(parsed.observations)) throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", "serialized Slice B snapshot observations are malformed");
  const relationshipIds = new Set<string>();
  for (const [index, entry] of parsed.observations.entries()) {
    if (!isSafeArray(entry) || entry.length !== 2 || !isPlainRecord(entry[1]) || typeof entry[1].relationshipId !== "string") throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", `serialized Slice B observation entry ${index} is malformed`);
    relationshipIds.add(entry[1].relationshipId);
  }
  return [...relationshipIds].flatMap((relationshipId) => api.timeline(relationshipId));
}

function markReorged(values: Map<string, AcceptedEventRecord>, targets: readonly { readonly blockNumber: bigint; readonly oldBlockHash: string | null }[], excluded = new Set<string>()): Map<string, AcceptedEventRecord> {
  const next = new Map(values);
  for (const [key, record] of values) {
    if (excluded.has(key) || record.finalityState === "REORGED") continue;
    if (targets.some((target) => target.oldBlockHash === null ? BigInt(record.blockNumber) === target.blockNumber : BigInt(record.blockNumber) === target.blockNumber && record.blockHash === target.oldBlockHash)) next.set(key, Object.freeze({ ...record, finalityState: "REORGED" }));
  }
  return next;
}

export class SourceBackfill {
  private readonly manifest: SourceScopeManifest;
  private readonly provider: SourceReadProvider;
  private readonly c: SourceBackfillOptions["c"];
  private readonly b: SliceBSerializedBoundary;
  private readonly adapter: CapitalCommittedAdapter;
  private readonly autoReplay: boolean;
  private readonly clock: () => number;
  private snapshot: SerializedSliceBSnapshot | null = null;
  private cursor: BackfillCursor | null = null;
  private accepted = new Map<string, AcceptedEventRecord>();
  private identities = new Map<string, IdentityRecord>();
  private rejected: RejectedEventRecord[] = [];
  private duplicates: DuplicateEventRecord[] = [];
  private providerErrors: ProviderErrorRecord[] = [];
  private lastResult: BackfillResult | null = null;

  public constructor(options: SourceBackfillOptions) {
    const suppliedManifest = parseSourceScopeManifest(options.manifest);
    const canonicalManifest = loadCanonicalD0Manifest();
    if (serializeSourceScopeManifest(suppliedManifest).hash !== canonicalManifest.hash) throw new SourceIngestionError("UNSUPPORTED_SCOPE", "runtime manifest does not match the canonical D0 manifest");
    this.manifest = suppliedManifest;
    this.provider = options.provider;
    this.c = options.c;
    this.b = new SliceBSerializedBoundary(this.manifest);
    this.adapter = new CapitalCommittedAdapter(this.manifest);
    this.autoReplay = options.autoReplay ?? true;
    this.clock = options.clock ?? (() => Date.now());
    if (options.initialState) this.loadState(options.initialState);
  }

  public async run(request: BackfillRequest): Promise<BackfillResult> {
    this.validateRequest(request);
    const runAccepted: string[] = [];
    const runRejected: RejectedEventRecord[] = [];
    const runDuplicates: DuplicateEventRecord[] = [];
    const runProviderErrors: ProviderErrorRecord[] = [];
    let retry: RetrySummary | null = null;

    let identity: unknown;
    let latest: number;
    try {
      identity = await this.readProvider("getChainIdentity", () => this.provider.getChainIdentity(this.manifest), null);
      this.adapter.validateChainIdentity(identity);
    } catch (error) {
      const failure = this.failure("getChainIdentity", error, null);
      runProviderErrors.push(failure);
      this.providerErrors.push(failure);
      retry = this.maybeScheduleRetry(failure, this.snapshot);
      return this.finish(request, this.cursor ?? this.newCursor(request), this.snapshot, runAccepted, runRejected, runDuplicates, runProviderErrors, retry, null, false);
    }
    try {
      const rawLatest = await this.readProvider("getLatestBlockNumber", () => this.provider.getLatestBlockNumber(this.manifest), null);
      if (!isSafeBlock(rawLatest)) throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", "latest block number must be a safe nonnegative integer");
      latest = rawLatest;
    } catch (error) {
      const failure = this.failure("getLatestBlockNumber", error, null);
      runProviderErrors.push(failure);
      this.providerErrors.push(failure);
      retry = this.maybeScheduleRetry(failure, this.snapshot);
      return this.finish(request, this.cursor ?? this.newCursor(request), this.snapshot, runAccepted, runRejected, runDuplicates, runProviderErrors, retry, null, false);
    }

    const previousNext = this.cursor?.nextBlock ?? request.startBlock;
    const lookbackStart = Math.max(0, request.startBlock - this.manifest.finalityPolicy.depth);
    const trustedHistoryStart = earliestCanonicalHeaderBlock(this.snapshot, this.manifest);
    const scanStart = this.cursor !== null && request.startBlock === this.cursor.nextBlock
      ? Math.max(lookbackStart, trustedHistoryStart ?? lookbackStart)
      : request.startBlock;
    let currentCursor: BackfillCursor = {
      scope: request.scope,
      mode: "SPARSE_EVENT",
      requestedStart: request.startBlock,
      requestedEnd: request.endBlock,
      nextBlock: previousNext < request.startBlock ? request.startBlock : previousNext,
      lastCompletedBlock: this.cursor?.lastCompletedBlock ?? (scanStart > 0 ? scanStart - 1 : null),
      sequence: this.cursor?.sequence ?? 0,
    };

    if (!this.snapshot) {
      const anchorNumber = scanStart > 0 ? scanStart - 1 : 0;
      let anchor: SourceBlockHeader;
      try {
        const anchorRaw = await this.readProvider("getBlockHeader", () => this.provider.getBlockHeader(this.manifest, anchorNumber), anchorNumber);
        anchor = validateBlock(anchorRaw, "anchor block", anchorNumber);
      } catch (error) {
        const failure = this.failure("getBlockHeader", error, anchorNumber);
        runProviderErrors.push(failure);
        this.providerErrors.push(failure);
        retry = this.maybeScheduleRetry(failure, this.snapshot);
        return this.finish(request, currentCursor, this.snapshot, runAccepted, runRejected, runDuplicates, runProviderErrors, retry, null, false);
      }
      this.snapshot = this.b.initialize(anchor);
      try {
        await this.checkpoint(this.snapshot);
        this.cursor = currentCursor;
      } catch (error) {
        const failure = this.failure("checkpoint", error, anchorNumber);
        runProviderErrors.push(failure);
        this.providerErrors.push(failure);
        retry = this.maybeScheduleRetry(failure, this.snapshot);
        return this.finish(request, currentCursor, this.snapshot, runAccepted, runRejected, runDuplicates, runProviderErrors, retry, null, false);
      }
    }

    let workingSnapshot = this.snapshot;
    let workingAccepted = new Map(this.accepted);
    let workingIdentities = new Map(this.identities);
    const finalityHeight = latest - this.manifest.finalityPolicy.depth;
    let lastCompletedForRun: number | null = scanStart > 0 ? scanStart - 1 : null;
    let blockedAt: number | null = null;

    for (let blockNumber = scanStart; blockNumber <= request.endBlock; blockNumber += 1) {
      if (blockNumber > latest) {
        const failure = this.failure("getBlockHeader", new SourceIngestionError("NOT_FOUND", "requested block is above the provider latest block"), blockNumber);
        runProviderErrors.push(failure);
        this.providerErrors.push(failure);
        blockedAt = blockNumber;
        retry = this.maybeScheduleRetry(failure, this.snapshot);
        break;
      }
      let block: SourceBlockHeader;
      let parent: SourceBlockHeader | null;
      let logs: SourceLog[];
      let readMethod: ProviderErrorRecord["method"] = "getBlockHeader";
      try {
        const rawBlock = await this.readProvider("getBlockHeader", () => this.provider.getBlockHeader(this.manifest, blockNumber), blockNumber);
        block = validateBlock(rawBlock, "block header", blockNumber);
        if (blockNumber > 0) {
          const rawParent = await this.readProvider("getBlockHeader", () => this.provider.getBlockHeader(this.manifest, blockNumber - 1), blockNumber - 1);
          parent = validateBlock(rawParent, "parent block", blockNumber - 1);
          if (block.parentHash !== parent.blockHash) throw new SourceIngestionError("MISSING_TRUSTED_HISTORY", "block parent hash does not match the trusted parent header");
        } else {
          parent = null;
        }
        readMethod = "getLogs";
        const rawLogs = await this.readProvider("getLogs", () => this.provider.getLogs(this.manifest, {
          address: this.manifest.contract.address,
          topic0: this.manifest.eventFamily.selector,
          fromBlock: blockNumber,
          toBlock: blockNumber,
        }), blockNumber);
        if (!isSafeArray(rawLogs)) throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", "getLogs must return a dense safe array");
        logs = rawLogs.map((raw, index) => validateLog(raw, `logs[${index}]`, block)).sort((left, right) => left.transactionIndex - right.transactionIndex || left.logIndex - right.logIndex || left.transactionHash.localeCompare(right.transactionHash));
      } catch (error) {
        const method: ProviderErrorRecord["method"] = error instanceof SourceIngestionError && error.code === "MISSING_TRUSTED_HISTORY" ? "getBlockHeader" : errorMethod(error, readMethod);
        const failure = this.failure(method, error, blockNumber);
        runProviderErrors.push(failure);
        this.providerErrors.push(failure);
        blockedAt = blockNumber;
        retry = this.maybeScheduleRetry(failure, this.snapshot);
        break;
      }

      const receiptCache = new Map<string, unknown>();
      const previousBlockCheckpoint = this.b.read(workingSnapshot).checkpoint(this.manifest.chainKey);
      let workingBlockSnapshot = this.b.observeBlockHeader(workingSnapshot, block);
      const observedHeaderApi = this.b.read(workingBlockSnapshot);
      const headerObservationId = `block-header:${this.manifest.scopeId}:${block.blockNumber}:${block.blockHash}`;
      const headerRejected = observedHeaderApi.investigations().some((item) => item !== null && typeof item === "object" && (item as { observationId?: unknown }).observationId === headerObservationId);
      const headerCheckpoint = observedHeaderApi.checkpoint(this.manifest.chainKey);
      const headerDidNotAdvance = previousBlockCheckpoint?.replayStatus !== "REPLAY_REQUIRED"
        && BigInt(block.blockNumber) > (previousBlockCheckpoint?.lastObservedBlock ?? -1n)
        && (!headerCheckpoint || headerCheckpoint.lastObservedBlock !== BigInt(block.blockNumber) || headerCheckpoint.lastObservedBlockHash !== block.blockHash);
      if (headerRejected || headerDidNotAdvance) {
        const failure = this.failure("checkpoint", new SourceIngestionError("MISSING_TRUSTED_HISTORY", headerRejected ? "Slice B rejected the block header" : "Slice B did not advance the canonical block header checkpoint"), blockNumber);
        runProviderErrors.push(failure);
        this.providerErrors.push(failure);
        blockedAt = blockNumber;
        break;
      }
      let workingBlockAccepted = new Map(workingAccepted);
      const workingBlockIdentities = new Map(workingIdentities);
      const blockAccepted: string[] = [];
      const blockRejected: RejectedEventRecord[] = [];
      const blockDuplicates: DuplicateEventRecord[] = [];
      const replacementCandidates: NormalizedSourceObservation[] = [];
      let blockFailure: BlockFailure | null = null;

      for (const log of logs) {
        const txHash = log.transactionHash.toLowerCase();
        let receipt: unknown;
        try {
          if (!receiptCache.has(txHash)) receiptCache.set(txHash, await this.readProvider("getTransactionReceipt", () => this.provider.getTransactionReceipt(this.manifest, txHash), blockNumber));
          receipt = receiptCache.get(txHash);
          const normalized = this.adapter.adapt({ identity, block, parent, log, receipt });
          const key = eventIdentityKey(normalized);
          const existing = workingBlockIdentities.get(key);
          if (existing) {
            if (existing.payloadHash === normalized.payloadHash && existing.blockHash === normalized.coordinates.blockHash && existing.transactionHash === normalized.coordinates.transactionHash && existing.transactionIndex === normalized.coordinates.transactionIndex && existing.logIndex === normalized.coordinates.logIndex) {
              blockDuplicates.push(Object.freeze({ eventId: normalized.observationId, payloadHash: normalized.payloadHash, disposition: "NOOP" }));
            } else {
              blockRejected.push(Object.freeze({ eventId: normalized.observationId, blockNumber: normalized.coordinates.blockNumber, transactionHash: normalized.coordinates.transactionHash, logIndex: normalized.coordinates.logIndex, code: "CONFLICTING_IDENTITY", reason: "source identity was observed with conflicting payload or block coordinates" }));
            }
            continue;
          }
          const nextSnapshot = this.b.ingest(workingBlockSnapshot, normalized.observation);
          const indexed = this.b.read(nextSnapshot).timeline(normalized.observation.relationshipId).filter((item) => publicObservationMatches(normalized, item));
          if (indexed.length !== 1) throw new SourceIngestionError("INCONSISTENT_SOURCE_DATA", "Slice B did not index the normalized source observation exactly once");
          workingBlockSnapshot = nextSnapshot;
          const record = observationSummary(normalized, finalityHeight);
          workingBlockAccepted.set(key, record);
          workingBlockIdentities.set(key, record);
          blockAccepted.push(key);
          replacementCandidates.push(normalized);
        } catch (error) {
          if (isEventRejection(error)) {
            blockRejected.push(Object.freeze({ eventId: rejectionId(log), blockNumber: log.blockNumber, transactionHash: log.transactionHash, logIndex: log.logIndex, code: error instanceof SourceIngestionError ? error.code : "INVALID_SOURCE_EVENT", reason: error instanceof Error ? error.message : "source event rejected" }));
          } else {
            blockFailure = { method: errorMethod(error, "getTransactionReceipt"), error, blockNumber };
            break;
          }
        }
      }

      if (blockFailure) {
        const failure = this.failure(blockFailure.method, blockFailure.error, blockFailure.blockNumber);
        runProviderErrors.push(failure);
        this.providerErrors.push(failure);
        blockedAt = blockNumber;
        retry = this.maybeScheduleRetry(failure, this.snapshot);
        break;
      }

      if (finalityHeight >= 0) {
        try {
          workingBlockSnapshot = this.b.advanceFinality(workingBlockSnapshot, finalityHeight, block.timestamp);
        } catch (error) {
          const failure = this.failure("checkpoint", error, blockNumber);
          runProviderErrors.push(failure);
          this.providerErrors.push(failure);
          blockedAt = blockNumber;
          retry = this.maybeScheduleRetry(failure, this.snapshot);
          break;
        }
      }
      let effectiveFinalityHeight = finalizedHeight(workingBlockSnapshot, this.c, this.manifest);
      const checkpoint = checkpointState(workingBlockSnapshot, this.c, this.manifest);
      if (checkpoint?.replayStatus === "REPLAY_REQUIRED") {
        workingBlockAccepted = markReorged(workingBlockAccepted, checkpoint.replayTargets, new Set(blockAccepted));
      }
      if (checkpoint?.replayStatus === "REPLAY_REQUIRED" && this.autoReplay && finalityHeight >= 0) {
        const seen = new Set<string>();
        let progress = true;
        while (progress) {
          progress = false;
          const currentCheckpoint = checkpointState(workingBlockSnapshot, this.c, this.manifest);
          if (currentCheckpoint?.replayStatus !== "REPLAY_REQUIRED") break;
          for (const target of currentCheckpoint.replayTargets) {
            const candidates = [
              ...replacementCandidates.map((candidate) => candidate.observation),
              ...this.findReplayCandidates(workingBlockSnapshot, target, workingBlockAccepted.values()),
            ];
            for (const candidate of candidates) {
              if (seen.has(candidate.observationId)) continue;
              seen.add(candidate.observationId);
              if (candidate.blockNumber !== target.blockNumber || candidate.blockHash === target.oldBlockHash || (target.oldBlockHash !== null && candidate.parentBlockHash !== target.expectedParentBlockHash)) continue;
              const replay = this.b.replay(workingBlockSnapshot, candidate, finalityHeight, block.timestamp);
              workingBlockSnapshot = replay.snapshot;
              if (replay.outcome === "REPLAYED") {
                workingBlockAccepted = markReorged(workingBlockAccepted, [target]);
                progress = true;
                break;
              }
            }
            if (progress) break;
          }
          effectiveFinalityHeight = finalizedHeight(workingBlockSnapshot, this.c, this.manifest);
          if (effectiveFinalityHeight === null) break;
        }
      }

      try {
        await this.checkpoint(workingBlockSnapshot);
      } catch (error) {
        const failure = this.failure("checkpoint", error, blockNumber);
        runProviderErrors.push(failure);
        this.providerErrors.push(failure);
        blockedAt = blockNumber;
        retry = this.maybeScheduleRetry(failure, this.snapshot);
        break;
      }

      const blockSnapshotChanged = workingBlockSnapshot.hash !== workingSnapshot.hash;
      workingAccepted = this.updateFinality(workingBlockAccepted, effectiveFinalityHeight ?? -1, new Set(blockAccepted), finalityHeight);
      workingIdentities = workingBlockIdentities;
      workingSnapshot = workingBlockSnapshot;
      this.snapshot = workingSnapshot;
      this.accepted = workingAccepted;
      this.identities = workingIdentities;
      runAccepted.push(...blockAccepted);
      runRejected.push(...blockRejected);
      runDuplicates.push(...blockDuplicates);
      this.rejected.push(...blockRejected);
      this.duplicates.push(...blockDuplicates);
      lastCompletedForRun = blockNumber;
      const advancedState = blockNumber >= previousNext || blockAccepted.length > 0 || blockRejected.length > 0 || blockSnapshotChanged;
      currentCursor = Object.freeze({ ...currentCursor, nextBlock: Math.max(currentCursor.nextBlock, blockNumber + 1), lastCompletedBlock: Math.max(currentCursor.lastCompletedBlock ?? -1, blockNumber), sequence: currentCursor.sequence + (advancedState ? 1 : 0) });
      this.cursor = currentCursor;
    }

    const finalSnapshot = this.snapshot;
    const safeCursor = this.cursor ?? currentCursor;
    const completedRange = blockedAt === null
      ? { startBlock: request.startBlock, endBlock: request.endBlock }
      : (lastCompletedForRun !== null && lastCompletedForRun >= request.startBlock ? { startBlock: request.startBlock, endBlock: lastCompletedForRun } : null);
    const result = this.finish(request, safeCursor, finalSnapshot, runAccepted, runRejected, runDuplicates, runProviderErrors, retry, completedRange, blockedAt === null);
    this.lastResult = result;
    return result;
  }

  public status(): BackfillResult | null {
    if (!this.lastResult) return null;
    const retry = this.retryProjection();
    return Object.freeze({ ...this.lastResult, retryStatus: retry.retryStatus, deadLetters: retry.deadLetters });
  }

  public serializeState(): string {
    const state: SerializedBackfillState = {
      schemaVersion: "slice-d-source-ingestion-v1",
      manifestHash: this.manifestHash(),
      cursor: this.cursor,
      snapshot: this.snapshot,
      acceptedEvents: sortedAccepted(this.accepted.values()),
      rejectedEvents: sortedRejected(this.rejected),
      duplicateEvents: sortedDuplicates(this.duplicates),
      providerErrors: [...this.providerErrors],
    };
    return canonicalJson(state);
  }

  public static fromSerialized(options: Omit<SourceBackfillOptions, "initialState">, serialized: string): SourceBackfill {
    let parsed: unknown;
    try {
      parsed = JSON.parse(serialized) as unknown;
    } catch {
      throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", "backfill state is not valid JSON");
    }
    const expectedManifestHash = manifestHashForBody(serializeSourceScopeManifest(options.manifest).body);
    validateStateEnvelope(parsed, expectedManifestHash, options.manifest.scopeId);
    if (canonicalJson(parsed) !== serialized) throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", "backfill state is not canonical JSON");
    return new SourceBackfill({ ...options, initialState: parsed });
  }

  public submitReplayHandoff(deliveryId: string) {
    if (!this.snapshot) throw new SourceIngestionError("MISSING_TRUSTED_HISTORY", "there is no serialized read model to hand off");
    return this.c.submitRetry(this.snapshot, {
      deliveryId,
      selector: { kind: "checkpoint", id: String(this.manifest.chainKey) },
      relationshipId: null,
      provider: "source-fixture",
      operation: "replay-required-handoff",
    });
  }

  public executeRetry(provider: import("../../../slice-c/retry-orchestration/src/index.js").ReadOnlyProvider | null, now = 0) {
    return this.c.executeRetry(provider, now);
  }

  public serializeRetry(): string {
    return this.c.serializeRetry();
  }

  public operatorReplay(jobId: string) {
    return this.c.retryOrchestrator.operatorReplay(jobId);
  }

  public retrySnapshot() {
    return this.c.retryOrchestrator.snapshot();
  }

  public restartRetry(serialized: string): SourceBackfill {
    const restarted = new SourceBackfill({
      manifest: this.manifest,
      provider: this.provider,
      c: this.c.restartRetry(serialized),
      autoReplay: this.autoReplay,
      clock: this.clock,
      initialState: JSON.parse(this.serializeState()) as SerializedBackfillState,
    });
    restarted.lastResult = this.lastResult;
    return restarted;
  }

  public readApi() {
    return this.snapshot ? this.c.read(this.snapshot) : null;
  }

  public async backfillTrustedReplayHeader(source: ObservationEnvelope): Promise<SerializedSliceBSnapshot> {
    if (!this.snapshot) throw new SourceIngestionError("MISSING_TRUSTED_HISTORY", "there is no serialized read model to repair");
    const next = this.b.backfillReplayHeader(this.snapshot, source);
    await this.checkpoint(next);
    this.snapshot = next;
    return next;
  }

  public stateHash(): string {
    return hashState(JSON.parse(this.serializeState()));
  }

  private loadState(state: SerializedBackfillState): void {
    validateStateEnvelope(state, this.manifestHash(), this.manifest.scopeId);
    if (state.snapshot) {
      this.c.read(state.snapshot);
      const api = this.b.read(state.snapshot);
      validateSnapshotBinding(state.snapshot, api, this.manifest, state.cursor);
      for (const record of state.acceptedEvents) {
        const matches = api.timeline(record.relationshipId).filter((item) => acceptedMatchesObservation(record, item, this.manifest));
        if (matches.length !== 1) throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", `accepted event ${record.observationId} does not match the public Slice B snapshot`);
      }
      const publicObservations = publicObservationsFromSnapshot(state.snapshot, api);
      if (publicObservations.length !== state.acceptedEvents.length) throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", "public Slice B observations and D1 accepted records are not cardinality-consistent");
      for (const observation of publicObservations) {
        const matches = state.acceptedEvents.filter((record) => acceptedMatchesObservation(record, observation, this.manifest));
        if (matches.length !== 1) throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", "public Slice B observation has no unique D1 accepted record");
      }
    } else if (state.acceptedEvents.length > 0) {
      throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", "accepted events require a serialized Slice B snapshot");
    }
    this.snapshot = state.snapshot;
    this.cursor = state.cursor;
    this.rejected = [...state.rejectedEvents];
    this.duplicates = [...state.duplicateEvents];
    this.providerErrors = [...state.providerErrors];
    for (const record of state.acceptedEvents) {
      const key = `${record.transactionHash}:${record.eventIndex}`;
      this.accepted.set(key, record);
      this.identities.set(key, record);
    }
  }

  private manifestHash(): string {
    return manifestHashForBody(serializeSourceScopeManifest(this.manifest).body);
  }

  private newCursor(request: BackfillRequest): BackfillCursor {
    return Object.freeze({ scope: request.scope, mode: "SPARSE_EVENT", requestedStart: request.startBlock, requestedEnd: request.endBlock, nextBlock: request.startBlock, lastCompletedBlock: request.startBlock > 0 ? request.startBlock - 1 : null, sequence: 0 });
  }

  private validateRequest(request: BackfillRequest): void {
    if (!isStructuredCloneable(request)) throw new SourceIngestionError("INVALID_BACKFILL_REQUEST", "backfill request must be cloneable");
    if (!isPlainRecord(request)) throw new SourceIngestionError("INVALID_BACKFILL_REQUEST", "backfill request must be a safe plain object");
    const allowed = new Set(["cursor", "endBlock", "finalityPolicy", "maxRange", "scope", "startBlock"]);
    const actual = Object.keys(request);
    if (actual.length > allowed.size || actual.some((key) => !allowed.has(key))) throw new SourceIngestionError("INVALID_BACKFILL_REQUEST", "backfill request contains an unsupported field");
    if (request.scope !== this.manifest.scopeId) throw new SourceIngestionError("UNSUPPORTED_SCOPE", "backfill scope does not match the D0 manifest");
    if (!isSafeBlock(request.startBlock) || !isSafeBlock(request.endBlock) || request.startBlock > request.endBlock || request.endBlock === Number.MAX_SAFE_INTEGER) throw new SourceIngestionError("INVALID_BACKFILL_REQUEST", "backfill range must leave room for a safe next cursor");
    const range = request.endBlock - request.startBlock + 1;
    const lookback = this.cursor !== null && request.startBlock === this.cursor.nextBlock ? this.manifest.finalityPolicy.depth : 0;
    const scanStart = Math.max(0, request.startBlock - lookback);
    if (request.endBlock - scanStart + 1 > this.manifest.cursor.maxRange) throw new SourceIngestionError("INVALID_BACKFILL_REQUEST", "backfill range plus the bounded reorg look-back exceeds the D0 maximum");
    if (this.cursor && request.startBlock > this.cursor.nextBlock) throw new SourceIngestionError("CURSOR_NOT_ADVANCED", "backfill range skips unprocessed source blocks");
    if (request.maxRange !== undefined && (!isSafeBlock(request.maxRange) || request.maxRange < range || request.maxRange > this.manifest.cursor.maxRange)) throw new SourceIngestionError("INVALID_BACKFILL_REQUEST", "request maxRange must bound the range and not exceed the D0 maximum");
    if (request.finalityPolicy) {
      if (!isPlainRecord(request.finalityPolicy) || Object.keys(request.finalityPolicy).sort().join(",") !== "depth,version" || typeof request.finalityPolicy.version !== "string" || !isSafeBlock(request.finalityPolicy.depth)) throw new SourceIngestionError("INVALID_BACKFILL_REQUEST", "finality policy shape is invalid");
      if (request.finalityPolicy.version !== this.manifest.finalityPolicy.version || request.finalityPolicy.depth !== this.manifest.finalityPolicy.depth) throw new SourceIngestionError("INVALID_BACKFILL_REQUEST", "finality policy must match the D0 manifest");
    }
    if (request.cursor !== undefined) {
      const cursor = request.cursor;
      if (cursor === null) {
        if (this.cursor !== null) throw new SourceIngestionError("CURSOR_NOT_ADVANCED", "null cursor cannot replace an existing safe cursor");
      } else {
        if (this.cursor === null) throw new SourceIngestionError("CURSOR_NOT_ADVANCED", "a supplied cursor requires a matching restored backfill state");
        if (!isPlainRecord(cursor) || Object.keys(cursor).sort().join(",") !== "lastCompletedBlock,nextBlock,requestedEnd,requestedStart,scope,sequence,mode".split(",").sort().join(",")) throw new SourceIngestionError("INVALID_BACKFILL_REQUEST", "cursor shape is invalid");
        if (cursor.scope !== this.manifest.scopeId || cursor.mode !== "SPARSE_EVENT" || !isSafeBlock(cursor.requestedStart) || !isSafeBlock(cursor.requestedEnd) || !isSafeBlock(cursor.nextBlock) || (cursor.lastCompletedBlock !== null && !isSafeBlock(cursor.lastCompletedBlock)) || !isSafeBlock(cursor.sequence)) throw new SourceIngestionError("INVALID_BACKFILL_REQUEST", "cursor does not match the bounded sparse-event cursor schema");
        if (cursor.scope !== this.cursor.scope || cursor.mode !== this.cursor.mode || cursor.requestedStart !== this.cursor.requestedStart || cursor.requestedEnd !== this.cursor.requestedEnd || cursor.nextBlock !== this.cursor.nextBlock || cursor.lastCompletedBlock !== this.cursor.lastCompletedBlock || cursor.sequence !== this.cursor.sequence) throw new SourceIngestionError("CURSOR_NOT_ADVANCED", "submitted cursor is not the last safe cursor");
      }
    }
  }

  private async readProvider<T>(method: ProviderErrorRecord["method"], callback: () => Promise<T> | T, blockNumber: number | null): Promise<T> {
    try {
      return await callback();
    } catch (error) {
      throw asProviderError(error);
    }
  }

  private retryProjection(): { readonly retryStatus: BackfillRetryStatus; readonly deadLetters: readonly Record<string, unknown>[] } {
    const retrySnapshot = this.c.retryOrchestrator.snapshot();
    const sourceJobs = retrySnapshot.jobs.filter((job) => job.provider === "source-fixture");
    const sourceDeadLetters = retrySnapshot.deadLetters.filter((item) => item.jobId !== null && sourceJobs.some((job) => job.id === item.jobId)).map((item) => ({ ...item }));
    const activeDeadLetters = sourceDeadLetters.filter((item) => sourceJobs.some((job) => job.id === item.jobId && job.status === "DEAD_LETTERED"));
    const latestJob = sourceJobs[sourceJobs.length - 1];
    const retryStatus: BackfillRetryStatus = activeDeadLetters.length > 0 ? "DEAD_LETTERED" : latestJob?.status === "COMPLETED" ? "COMPLETED" : latestJob?.status ?? "NONE";
    return { retryStatus, deadLetters: Object.freeze(sourceDeadLetters) };
  }

  private findReplayCandidates(
    snapshot: SerializedSliceBSnapshot,
    target: { readonly blockNumber: bigint; readonly oldBlockHash: string | null; readonly expectedParentBlockHash: string | null },
    accepted: Iterable<AcceptedEventRecord>,
  ): ObservationEnvelope[] {
    const preferred = new Set(parseReplayHistory(snapshot).flatMap((attempt) => typeof attempt.replacementObservationId === "string" ? [attempt.replacementObservationId] : []));
    const candidates: { readonly preferred: boolean; readonly observation: ObservationEnvelope }[] = [];
    const api = this.c.read(snapshot);
    for (const record of accepted) {
      if (BigInt(record.blockNumber) !== target.blockNumber) continue;
      for (const value of api.timeline(record.relationshipId)) {
        if (!isPlainRecord(value) || typeof value.observationId !== "string" || typeof value.blockNumber !== "bigint" || typeof value.blockHash !== "string" || (value.parentBlockHash !== null && typeof value.parentBlockHash !== "string")) continue;
        if (value.observationId !== record.observationId || value.blockNumber !== target.blockNumber || value.blockHash === target.oldBlockHash || value.parentBlockHash !== target.expectedParentBlockHash || !["OBSERVED", "DUPLICATE"].includes(String(value.observationState)) || value.finalityState === "REORGED") continue;
        candidates.push({ preferred: preferred.has(value.observationId), observation: value as unknown as ObservationEnvelope });
      }
    }
    return candidates.sort((left, right) => Number(right.preferred) - Number(left.preferred) || left.observation.observationId.localeCompare(right.observation.observationId)).map((candidate) => candidate.observation);
  }

  private async checkpoint(snapshot: SerializedSliceBSnapshot): Promise<void> {
    try {
      await this.c.checkpoint(snapshot, { savedAt: this.clock() });
    } catch (error) {
      throw new SourceIngestionError("OUTAGE", error instanceof Error ? error.message : "serialized checkpoint failed");
    }
  }

  private failure(method: ProviderErrorRecord["method"], error: unknown, blockNumber: number | null): ProviderErrorRecord {
    const normalized = error instanceof SourceIngestionError ? error : asProviderError(error);
    return Object.freeze({ method, code: normalized.code, reason: normalized.message, blockNumber, recoverable: RECOVERABLE.has(normalized.code) });
  }

  private maybeScheduleRetry(failure: ProviderErrorRecord, snapshot: SerializedSliceBSnapshot | null): RetrySummary | null {
    if (!snapshot || !failure.recoverable || (failure.method !== "getBlockHeader" && failure.method !== "getLogs" && failure.method !== "getTransactionReceipt" && failure.method !== "getChainIdentity" && failure.method !== "getLatestBlockNumber" && failure.method !== "checkpoint")) return null;
    try {
      const result = this.c.submitRetry(snapshot, {
        deliveryId: `source-backfill:${this.manifest.scopeId}:${failure.blockNumber ?? this.cursor?.nextBlock ?? "identity"}`,
        selector: { kind: "checkpoint", id: String(this.manifest.chainKey) },
        relationshipId: null,
        provider: "source-fixture",
        operation: "provider-read",
      });
      return Object.freeze({ disposition: result.disposition, jobId: result.job?.id ?? null, reason: result.receipt.reason });
    } catch (error) {
      return Object.freeze({ disposition: "REJECTED", jobId: null, reason: error instanceof Error ? error.message : "retry submission failed" });
    }
  }

  private updateFinality(values: Map<string, AcceptedEventRecord>, finality: number, newlyAccepted = new Set<string>(), observedFinality = finality): Map<string, AcceptedEventRecord> {
    const next = new Map<string, AcceptedEventRecord>();
    for (const [key, value] of values) next.set(key, value.finalityState === "REORGED" ? value : withFinality(value, newlyAccepted.has(key) ? observedFinality : finality));
    return next;
  }

  private finish(
    request: BackfillRequest,
    cursor: BackfillCursor,
    snapshot: SerializedSliceBSnapshot | null,
    runAcceptedKeys: readonly string[],
    runRejected: readonly RejectedEventRecord[],
    runDuplicates: readonly DuplicateEventRecord[],
    runProviderErrors: readonly ProviderErrorRecord[],
    retry: RetrySummary | null,
    completedRange: { readonly startBlock: number; readonly endBlock: number } | null,
    complete: boolean,
  ): BackfillResult {
    const cp = checkpointState(snapshot, this.c, this.manifest);
    const finalized = finalizedHeight(snapshot, this.c, this.manifest);
    const acceptedEvents = sortedAccepted(runAcceptedKeys.map((key) => this.accepted.get(key)).filter((item): item is AcceptedEventRecord => item !== undefined));
    const replayStatus = cp?.replayStatus ?? "CURRENT";
    const replay = replayDetails(snapshot, this.c, this.manifest);
    const pending = acceptedEvents.some((item) => item.finalityState !== "FINALIZED" && item.finalityState !== "REORGED") || [...this.accepted.values()].some((item) => item.finalityState !== "REORGED" && (finalized === null || item.blockNumber > finalized));
    let status: BackfillResult["status"];
    if (runProviderErrors.length > 0 || !complete) status = "BLOCKED";
    else if (replayStatus === "REPLAY_REQUIRED") status = "REPLAY_REQUIRED";
    else if (runRejected.length > 0 && acceptedEvents.length === 0) status = "REJECTED";
    else if (pending) status = "FINALITY_PENDING";
    else status = "COMPLETED";
    const nextAction = status === "BLOCKED" ? "retry the current safe cursor after repairing the provider or checkpoint" : status === "REPLAY_REQUIRED" ? "operator must supply the exact trusted history and finalized replacement for the replay target" : status === "FINALITY_PENDING" ? "wait for the D0 confirmation depth, then obtain proof separately" : status === "REJECTED" ? "inspect rejected source events; no rejected observation entered the graph" : "no further bounded source-read action is required";
    const markers: BackfillStatusMarker[] = [];
    if (this.accepted.size > 0) markers.push("OBSERVED");
    if (pending) markers.push("FINALITY_PENDING");
    if ([...this.accepted.values()].some((item) => item.finalityState === "FINALIZED")) markers.push("FINALIZED");
    if (this.accepted.size > 0) markers.push("PENDING_PROOF", "RECONCILIATION_PENDING");
    if (replayStatus === "REPLAY_REQUIRED") markers.push("REPLAY_REQUIRED");
    if (parseReplayHistory(snapshot).length > 0 || replayStatus === "REPLAY_REQUIRED") markers.push("REORG_DETECTED");
    if (runRejected.length > 0) markers.push("REJECTED");
    if (status === "BLOCKED") markers.push("BLOCKED");
    const retryView = this.retryProjection();
    const result: BackfillResult = Object.freeze({
      status,
      statusMarkers: Object.freeze([...new Set(markers)]),
      scope: request.scope,
      requestedRange: { startBlock: request.startBlock, endBlock: request.endBlock },
      completedRange,
      cursor,
      observedHeight: observedHeight(this.accepted.values()),
      finalizedHeight: finalized,
      acceptedEvents,
      rejectedEvents: sortedRejected(runRejected),
      duplicateEvents: sortedDuplicates(runDuplicates),
      providerErrors: [...runProviderErrors],
      replayHistory: parseReplayHistory(snapshot),
      replayTargets: Object.freeze([...replay.targets]),
      replayOwner: replay.owner,
      replayRecoveryRole: replay.recoveryRole,
      replayReason: replay.reason,
      replayNextAction: replay.nextAction,
      replayStatus,
      evidenceStatus: "PENDING_PROOF",
      reconciliationStatus: "RECONCILIATION_PENDING",
      retry,
      retryStatus: retryView.retryStatus,
      deadLetters: retryView.deadLetters,
      nextAction,
      responsibleRole: "source-ingestion-operator",
      snapshot,
    });
    this.lastResult = result;
    return result;
  }
}

function isEventRejection(error: unknown): boolean {
  return error instanceof SourceIngestionError && (error.code === "INVALID_SOURCE_EVENT" || error.code === "CONFLICTING_IDENTITY");
}

function errorMethod(error: unknown, fallback: ProviderErrorRecord["method"]): ProviderErrorRecord["method"] {
  if (error instanceof SourceIngestionError && error.code === "MISSING_TRUSTED_HISTORY") return "getBlockHeader";
  return fallback;
}

export type { BackfillRequest } from "./types.js";
