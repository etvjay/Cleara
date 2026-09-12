import {
  SLICE_B_SCHEMA_VERSION,
  type RecordSelector,
  type RelationshipId,
  type SerializedSliceBContract,
  type SliceBRecordKind,
  type SourceCursor,
} from "./types.js";
import { canonicalJson, identityHash, serializedSliceBHash } from "./canonical.js";

export class ContractError extends Error {
  public readonly name = "ContractError";

  public constructor(
    public readonly code:
    | "INVALID_CONTRACT"
    | "CONTRACT_HASH_MISMATCH"
    | "UNSUPPORTED_SCHEMA"
    | "INVALID_CONTRACT_RECORD"
    | "RECORD_NOT_FOUND"
    | "SCOPE_MISMATCH"
    | "AMBIGUOUS_RECORD_SCOPE"
    | "REPLAY_NOT_REQUIRED",
    message: string,
  ) {
    super(message);
  }
}

export interface ParsedSliceBRecord {
  readonly kind: SliceBRecordKind;
  readonly key: string;
  readonly id: string;
  readonly relationshipId: RelationshipId;
  readonly cursor: SourceCursor;
  readonly status: Readonly<Record<string, string | null>>;
  readonly replay: import("./types.js").ReplayMetadata | null;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface ParsedSliceBContract {
  readonly hash: string;
  readonly body: Readonly<Record<string, unknown>>;
  readonly records: readonly ParsedSliceBRecord[];
}

type PlainRecord = Record<string, unknown>;

const RECORD_KINDS: readonly SliceBRecordKind[] = [
  "observation",
  "evidence",
  "canonical",
  "reconciliation",
  "checkpoint",
  "dead-letter",
  "replay",
];

const STATUS_FIELDS = [
  "observationState",
  "finalityState",
  "status",
  "readStatus",
  "state",
  "replayStatus",
  "replayReason",
  "replayOwner",
  "replayRecoveryRole",
  "replayNextAction",
  "evidenceMode",
] as const;

function isPlainRecord(value: unknown): value is PlainRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.keys(value).every((key) => !["__proto__", "constructor", "prototype"].includes(key));
}

function requirePlainRecord(value: unknown, field: string): PlainRecord {
  if (!isPlainRecord(value)) throw new ContractError("INVALID_CONTRACT", `${field} must be a plain object`);
  return value;
}

function requireString(value: unknown, field: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && (value.length === 0 || value.trim() !== value))) {
    throw new ContractError("INVALID_CONTRACT", `${field} must be a trimmed string`);
  }
  return value;
}

function optionalString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  return requireString(value, field);
}

function optionalNumber(value: unknown, field: string, integer = false): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || (integer && !Number.isSafeInteger(value))) {
    throw new ContractError("INVALID_CONTRACT_RECORD", `${field} must be a finite ${integer ? "integer" : "number"}`);
  }
  return value;
}

function recordEntries(body: PlainRecord, field: string): readonly [unknown, unknown][] {
  const value = body[field];
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new ContractError("INVALID_CONTRACT_RECORD", `${field} must be an array`);
  return value.map((entry, index) => {
    if (!Array.isArray(entry) || entry.length !== 2) {
      throw new ContractError("INVALID_CONTRACT_RECORD", `${field}[${index}] must be a two-item entry`);
    }
    return [entry[0], entry[1]] as [unknown, unknown];
  });
}

function assertSafeJsonValue(value: unknown, ancestors = new Set<object>()): void {
  if (value === null || typeof value !== "object") return;
  if (ancestors.has(value)) throw new ContractError("INVALID_CONTRACT", "contract.body contains a cycle");
  if (!Array.isArray(value) && !isPlainRecord(value)) {
    throw new ContractError("INVALID_CONTRACT", "contract.body contains an unsafe object");
  }
  const nextAncestors = new Set(ancestors).add(value);
  if (Array.isArray(value)) {
    for (const item of value) assertSafeJsonValue(item, nextAncestors);
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (["__proto__", "constructor", "prototype"].includes(key)) {
      throw new ContractError("INVALID_CONTRACT", "contract.body contains an unsafe key");
    }
    assertSafeJsonValue(item, nextAncestors);
  }
}

function requireBigIntText(value: unknown, field: string, nullable = false): void {
  if (nullable && value === null) return;
  if (typeof value !== "string" || !/^\d+n$/.test(value)) {
    throw new ContractError("INVALID_CONTRACT_RECORD", `${field} must be a nonnegative bigint string`);
  }
}

function validateKnownBigints(body: PlainRecord): void {
  for (const [, value] of recordEntries(body, "sourceScopes")) {
    const scope = requirePlainRecord(value, "sourceScope");
    if (Object.prototype.hasOwnProperty.call(scope, "anchorBlockNumber")) requireBigIntText(scope.anchorBlockNumber, "sourceScope.anchorBlockNumber");
  }
  for (const [key, value] of recordEntries(body, "observations")) {
    const record = requirePlainRecord(value, `observations.${String(key)}`);
    if (Object.prototype.hasOwnProperty.call(record, "blockNumber")) requireBigIntText(record.blockNumber, "observation.blockNumber");
  }
  for (const [key, value] of recordEntries(body, "evidence")) {
    const record = requirePlainRecord(value, `evidence.${String(key)}`);
    if (Object.prototype.hasOwnProperty.call(record, "blockNumber")) requireBigIntText(record.blockNumber, "evidence.blockNumber");
  }
  for (const [key, value] of recordEntries(body, "canonical")) {
    const record = requirePlainRecord(value, `canonical.${String(key)}`);
    if (Object.prototype.hasOwnProperty.call(record, "blockNumber")) requireBigIntText(record.blockNumber, "canonical.blockNumber", true);
  }
  for (const [key, value] of recordEntries(body, "checkpoints")) {
    const checkpoint = requirePlainRecord(value, `checkpoints.${String(key)}`);
    if (Object.prototype.hasOwnProperty.call(checkpoint, "lastObservedBlock")) requireBigIntText(checkpoint.lastObservedBlock, "checkpoint.lastObservedBlock");
    if (Object.prototype.hasOwnProperty.call(checkpoint, "lastFinalizedBlock")) requireBigIntText(checkpoint.lastFinalizedBlock, "checkpoint.lastFinalizedBlock", true);
    if (Object.prototype.hasOwnProperty.call(checkpoint, "replayFromBlock")) requireBigIntText(checkpoint.replayFromBlock, "checkpoint.replayFromBlock", true);
    if (checkpoint.replayTargets !== undefined) {
      if (!Array.isArray(checkpoint.replayTargets)) throw new ContractError("INVALID_CONTRACT_RECORD", "checkpoint.replayTargets must be an array");
      checkpoint.replayTargets.forEach((target, index) => {
        const item = requirePlainRecord(target, `checkpoint.replayTargets[${index}]`);
        if (Object.prototype.hasOwnProperty.call(item, "blockNumber")) requireBigIntText(item.blockNumber, "replayTarget.blockNumber");
      });
    }
  }
  for (const [key, value] of recordEntries(body, "blockHistory")) {
    const header = requirePlainRecord(value, `blockHistory.${String(key)}`);
    if (Object.prototype.hasOwnProperty.call(header, "blockNumber")) requireBigIntText(header.blockNumber, "blockHeader.blockNumber");
  }
  for (const [index, value] of (Array.isArray(body.replayHistory) ? body.replayHistory.entries() : [])) {
    const replay = requirePlainRecord(value, `replayHistory[${index}]`);
    if (Object.prototype.hasOwnProperty.call(replay, "fromBlock")) requireBigIntText(replay.fromBlock, "replay.fromBlock");
    if (Object.prototype.hasOwnProperty.call(replay, "finalizedBlock")) requireBigIntText(replay.finalizedBlock, "replay.finalizedBlock");
  }
  for (const [index, value] of (Array.isArray(body.evidenceConflicts) ? body.evidenceConflicts.entries() : [])) {
    const conflict = requirePlainRecord(value, `evidenceConflicts[${index}]`);
    for (const field of ["existingContent", "conflictingContent"]) {
      const nested = conflict[field];
      if (nested !== undefined && nested !== null) {
        const record = requirePlainRecord(nested, `evidenceConflicts[${index}].${field}`);
        if (Object.prototype.hasOwnProperty.call(record, "blockNumber")) requireBigIntText(record.blockNumber, `${field}.blockNumber`);
      }
    }
  }
}

function statusMarkers(record: PlainRecord): Readonly<Record<string, string | null>> {
  const markers: Record<string, string | null> = {};
  for (const field of STATUS_FIELDS) {
    const value = record[field];
    if (value === undefined) continue;
    if (value !== null && typeof value !== "string") {
      throw new ContractError("INVALID_CONTRACT_RECORD", `${field} must be a string or null`);
    }
    markers[field] = value as string | null;
  }
  return Object.freeze(markers);
}

function relationshipFor(kind: SliceBRecordKind, record: PlainRecord): RelationshipId {
  if (kind === "checkpoint") return null;
  const value = record.relationshipId;
  if (kind === "observation" || kind === "reconciliation") {
    return requireString(value, `${kind}.relationshipId`);
  }
  if (value === undefined || value === null) return null;
  return requireString(value, `${kind}.relationshipId`);
}

function recordIdFor(kind: SliceBRecordKind, key: string, record: PlainRecord, index: number): string {
  const field = kind === "observation" ? "observationId"
    : kind === "evidence" ? "evidenceId"
      : kind === "canonical" ? "objectId"
        : kind === "reconciliation" ? "id"
          : kind === "checkpoint" ? "chainKey"
            : "id";
  const value = record[field];
  if (typeof value === "string" && value.length > 0) return value;
  if (kind === "checkpoint" && typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  if (kind === "dead-letter" && typeof record.observationId === "string") return record.observationId;
  if (kind === "replay" && typeof record.replacementObservationId === "string") return record.replacementObservationId;
  if (kind === "dead-letter" || kind === "replay") return `${kind}:${identityHash(record)}`;
  if (key.length > 0) return key;
  throw new ContractError("INVALID_CONTRACT_RECORD", `${kind}[${index}] has no deterministic identity`);
}

function cursorFor(kind: SliceBRecordKind, record: PlainRecord): SourceCursor {
  return {
    chainKey: optionalNumber(record.chainKey, `${kind}.chainKey`, true),
    blockNumber: optionalString(record.blockNumber, `${kind}.blockNumber`),
    eventIndex: optionalNumber(record.eventIndex, `${kind}.eventIndex`, true),
    sequence: optionalNumber(record.sequence ?? record.replaySequence, `${kind}.sequence`, true),
    occurredAt: optionalNumber(record.occurredAt, `${kind}.occurredAt`),
  };
}

function replayMetadataFor(kind: SliceBRecordKind, record: PlainRecord): import("./types.js").ReplayMetadata | null {
  if (kind !== "checkpoint") return null;
  const chainKey = optionalNumber(record.chainKey, "checkpoint.chainKey", true);
  if (chainKey === null) throw new ContractError("INVALID_CONTRACT_RECORD", "checkpoint.chainKey is required");
  const replayTargetsValue = record.replayTargets;
  if (replayTargetsValue !== undefined && !Array.isArray(replayTargetsValue)) {
    throw new ContractError("INVALID_CONTRACT_RECORD", "checkpoint.replayTargets must be an array");
  }
  const replayTargets = (replayTargetsValue ?? []).map((value, index) => {
    const target = requirePlainRecord(value, `checkpoint.replayTargets[${index}]`);
    const targetChainKey = optionalNumber(target.chainKey, `checkpoint.replayTargets[${index}].chainKey`, true);
    const blockNumber = optionalString(target.blockNumber, `checkpoint.replayTargets[${index}].blockNumber`);
    if (targetChainKey === null || blockNumber === null) {
      throw new ContractError("INVALID_CONTRACT_RECORD", `checkpoint.replayTargets[${index}] lacks chainKey or blockNumber`);
    }
    return {
      chainKey: targetChainKey,
      blockNumber,
      oldBlockHash: optionalString(target.oldBlockHash, `checkpoint.replayTargets[${index}].oldBlockHash`),
      oldParentBlockHash: optionalString(target.oldParentBlockHash, `checkpoint.replayTargets[${index}].oldParentBlockHash`),
      expectedParentBlockHash: optionalString(target.expectedParentBlockHash, `checkpoint.replayTargets[${index}].expectedParentBlockHash`),
    };
  });
  return {
    replaySequence: optionalNumber(record.replaySequence, "checkpoint.replaySequence", true) ?? 0,
    replayFromBlock: optionalString(record.replayFromBlock, "checkpoint.replayFromBlock"),
    replayOldBlockHash: optionalString(record.replayOldBlockHash, "checkpoint.replayOldBlockHash"),
    replayParentBlockHash: optionalString(record.replayParentBlockHash, "checkpoint.replayParentBlockHash"),
    replayTargets,
  };
}

function objectEntries(body: PlainRecord, field: string): readonly [unknown, unknown][] {
  const value = body[field];
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new ContractError("INVALID_CONTRACT_RECORD", `${field} must be an array`);
  return value.map((entry, index) => {
    const record = requirePlainRecord(entry, `${field}[${index}]`);
    const key = typeof record.id === "string" ? record.id
      : typeof record.observationId === "string" ? record.observationId
        : typeof record.replacementObservationId === "string" ? record.replacementObservationId
          : `${field}:${index}`;
    return [key, record] as [unknown, unknown];
  });
}

function recordsFor(kind: SliceBRecordKind, body: PlainRecord): readonly ParsedSliceBRecord[] {
  const field = kind === "observation" ? "observations"
    : kind === "evidence" ? "evidence"
      : kind === "canonical" ? "canonical"
        : kind === "reconciliation" ? "reconciliations"
          : kind === "checkpoint" ? "checkpoints"
            : kind === "dead-letter" ? "deadLetters"
              : "replayHistory";
  const entries = kind === "dead-letter" || kind === "replay" ? objectEntries(body, field) : recordEntries(body, field);
  return entries.map(([rawKey, rawValue], index) => {
    const record = requirePlainRecord(rawValue, `${field}[${index}]`);
    const key = typeof rawKey === "string" || typeof rawKey === "number" ? String(rawKey) : "";
    if (key.length === 0) throw new ContractError("INVALID_CONTRACT_RECORD", `${field}[${index}] has no map key`);
    return {
      kind,
      key,
      id: recordIdFor(kind, key, record, index),
      relationshipId: relationshipFor(kind, record),
      cursor: cursorFor(kind, record),
      status: statusMarkers(record),
      replay: replayMetadataFor(kind, record),
      raw: Object.freeze({ ...record }),
    } satisfies ParsedSliceBRecord;
  });
}

export function parseSerializedSliceBContract(input: unknown): ParsedSliceBContract {
  const envelope = requirePlainRecord(input, "serialized Slice B contract");
  const hash = requireString(envelope.hash, "contract.hash");
  const body = requireString(envelope.body, "contract.body");
  if (serializedSliceBHash(body) !== hash) throw new ContractError("CONTRACT_HASH_MISMATCH", "serialized body hash does not match contract hash");

  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    throw new ContractError("INVALID_CONTRACT", "contract.body is not valid JSON");
  }
  const bodyRecord = requirePlainRecord(parsed, "contract.body");
  assertSafeJsonValue(bodyRecord);
  if (bodyRecord.schemaVersion !== SLICE_B_SCHEMA_VERSION) {
    throw new ContractError("UNSUPPORTED_SCHEMA", "contract body is not a Slice B read-model snapshot");
  }
  validateKnownBigints(bodyRecord);
  if (canonicalJson(bodyRecord) !== body) {
    throw new ContractError("INVALID_CONTRACT", "contract.body must be canonical JSON");
  }

  const records = RECORD_KINDS.flatMap((kind) => recordsFor(kind, bodyRecord));
  return Object.freeze({ hash, body: Object.freeze({ ...bodyRecord }), records });
}

export function selectContractRecord(
  contract: ParsedSliceBContract,
  selector: RecordSelector,
  relationshipId: RelationshipId,
): ParsedSliceBRecord {
  const matches = contract.records.filter((record) => record.kind === selector.kind && (record.id === selector.id || record.key === selector.id));
  if (matches.length === 0) throw new ContractError("RECORD_NOT_FOUND", `no ${selector.kind} record matches ${selector.id}`);
  const scoped = matches.filter((record) => record.relationshipId === relationshipId);
  if (scoped.length === 0) throw new ContractError("SCOPE_MISMATCH", `${selector.kind} ${selector.id} is outside the requested relationship/global scope`);
  if (scoped.length > 1) throw new ContractError("AMBIGUOUS_RECORD_SCOPE", `${selector.kind} ${selector.id} is ambiguous within the requested scope`);
  return scoped[0]!;
}

export function requireReplayRequired(record: ParsedSliceBRecord): void {
  if (record.kind !== "checkpoint" || record.status.replayStatus !== "REPLAY_REQUIRED") {
    throw new ContractError("REPLAY_NOT_REQUIRED", "selected Slice B checkpoint is not REPLAY_REQUIRED");
  }
}
