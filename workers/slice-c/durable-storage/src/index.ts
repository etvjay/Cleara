import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const DURABLE_STORAGE_SCHEMA_VERSION = "slice-c-durable-storage-v1" as const;
export const SLICE_B_SCHEMA_VERSION = "slice-b-read-model-v1" as const;

export interface SerializedSliceBSnapshot {
  readonly hash: string;
  readonly body: string;
}

export interface PersistedSnapshotRecord {
  readonly storageSchemaVersion: typeof DURABLE_STORAGE_SCHEMA_VERSION;
  readonly scopeId: string;
  readonly sequence: number;
  readonly savedAt: number;
  readonly snapshot: SerializedSliceBSnapshot;
}

export interface CheckpointOptions {
  readonly sequence?: number;
  readonly expectedPreviousHash?: string | null;
  readonly savedAt?: number;
}

export interface StoredCheckpoint {
  readonly status: "STORED";
  readonly record: PersistedSnapshotRecord;
}

export interface DuplicateCheckpoint {
  readonly status: "DUPLICATE";
  readonly record: PersistedSnapshotRecord;
}

export type CheckpointResult = StoredCheckpoint | DuplicateCheckpoint;

export type SnapshotStoreErrorCode =
  | "INVALID_SCOPE"
  | "INVALID_SNAPSHOT"
  | "CORRUPT_SNAPSHOT_HASH"
  | "CORRUPT_SNAPSHOT_BODY"
  | "CORRUPT_RECORD"
  | "SCOPE_MISMATCH"
  | "STALE_CHECKPOINT"
  | "NON_MONOTONIC_CHECKPOINT"
  | "WRITE_FAILED";

export class SnapshotStoreError extends Error {
  constructor(
    readonly code: SnapshotStoreErrorCode,
    readonly reason: string,
  ) {
    super(`${code}: ${reason}`);
    this.name = "SnapshotStoreError";
  }
}

export function snapshotHashForBody(body: string): string {
  return createHash("sha256").update(`${body.length}:${body}`, "utf8").digest("hex");
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sortedJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown, seen = new Set<object>()): unknown {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) throw new SnapshotStoreError("CORRUPT_SNAPSHOT_BODY", "snapshot contains a cycle");
  const nextSeen = new Set(seen).add(value);
  if (Array.isArray(value)) return value.map((item) => sortJson(item, nextSeen));
  if (!isPlainRecord(value)) throw new SnapshotStoreError("CORRUPT_SNAPSHOT_BODY", "snapshot contains an unsafe object");
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key], nextSeen)]));
}

function rejectUnsafeKeys(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) throw new SnapshotStoreError("CORRUPT_SNAPSHOT_BODY", "snapshot contains a cycle");
  if (!Array.isArray(value) && !isPlainRecord(value)) throw new SnapshotStoreError("CORRUPT_SNAPSHOT_BODY", "snapshot contains an unsafe object");
  const nextSeen = new Set(seen).add(value);
  if (Array.isArray(value)) {
    for (const item of value) rejectUnsafeKeys(item, nextSeen);
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") throw new SnapshotStoreError("CORRUPT_SNAPSHOT_BODY", "snapshot contains an unsafe key");
    rejectUnsafeKeys(item, nextSeen);
  }
}

function requireBigIntString(value: unknown, field: string, nullable = false): void {
  if (nullable && value === null) return;
  if (typeof value !== "string" || !/^-?\d+n$/.test(value) || BigInt(value.slice(0, -1)) < 0n) {
    throw new SnapshotStoreError("CORRUPT_SNAPSHOT_BODY", `${field} must be a nonnegative bigint string`);
  }
}

function requireObject(value: unknown, field: string): Record<string, unknown> {
  if (!isPlainRecord(value)) throw new SnapshotStoreError("CORRUPT_SNAPSHOT_BODY", `${field} must be an object`);
  return value;
}

function requireArray(value: unknown, field: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new SnapshotStoreError("CORRUPT_SNAPSHOT_BODY", `${field} must be an array`);
  return value;
}

function requireEntries(value: unknown, field: string): readonly (readonly [unknown, unknown])[] {
  const entries = requireArray(value, field);
  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length !== 2) throw new SnapshotStoreError("CORRUPT_SNAPSHOT_BODY", `${field} must contain key/value pairs`);
  }
  return entries as readonly (readonly [unknown, unknown])[];
}

function validateKnownBigints(parsed: Record<string, unknown>): void {
  for (const [key, value] of requireEntries(parsed.sourceScopes, "sourceScopes")) requireBigIntString(requireObject(value, "sourceScope").anchorBlockNumber, "sourceScope.anchorBlockNumber");
  for (const [key, value] of requireEntries(parsed.observations, "observations")) requireBigIntString(requireObject(value, "observation").blockNumber, "observation.blockNumber");
  for (const [key, value] of requireEntries(parsed.evidence, "evidence")) requireBigIntString(requireObject(value, "evidence").blockNumber, "evidence.blockNumber");
  for (const [key, value] of requireEntries(parsed.canonical, "canonical")) requireBigIntString(requireObject(value, "canonical").blockNumber, "canonical.blockNumber", true);
  for (const [key, value] of requireEntries(parsed.checkpoints, "checkpoints")) {
    const checkpoint = requireObject(value, "checkpoint");
    requireBigIntString(checkpoint.lastObservedBlock, "checkpoint.lastObservedBlock");
    requireBigIntString(checkpoint.lastFinalizedBlock, "checkpoint.lastFinalizedBlock", true);
    for (const target of requireEntries(checkpoint.replayTargets, "checkpoint.replayTargets")) requireBigIntString(requireObject(target, "replayTarget").blockNumber, "replayTarget.blockNumber");
    requireBigIntString(checkpoint.replayFromBlock, "checkpoint.replayFromBlock", true);
  }
  for (const [key, value] of requireEntries(parsed.blockHistory, "blockHistory")) requireBigIntString(requireObject(value, "blockHeader").blockNumber, "blockHeader.blockNumber");
  for (const attempt of requireArray(parsed.replayHistory, "replayHistory")) {
    const replay = requireObject(attempt, "replay");
    requireBigIntString(replay.fromBlock, "replay.fromBlock");
    requireBigIntString(replay.finalizedBlock, "replay.finalizedBlock");
  }
  for (const conflict of requireArray(parsed.evidenceConflicts, "evidenceConflicts")) {
    const item = requireObject(conflict, "evidenceConflict");
    for (const field of ["existingContent", "conflictingContent"]) {
      if (item[field] !== undefined && item[field] !== null) requireBigIntString(requireObject(item[field], field).blockNumber, `${field}.blockNumber`);
    }
  }
}

function parseSnapshotBody(body: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    throw new SnapshotStoreError("CORRUPT_SNAPSHOT_BODY", "snapshot body is not valid JSON");
  }
  rejectUnsafeKeys(parsed);
  if (!isPlainRecord(parsed)) throw new SnapshotStoreError("CORRUPT_SNAPSHOT_BODY", "snapshot body must be a plain object");
  if (parsed.schemaVersion !== SLICE_B_SCHEMA_VERSION) throw new SnapshotStoreError("CORRUPT_SNAPSHOT_BODY", "unsupported Slice B snapshot schema");
  validateKnownBigints(parsed);
  if (sortedJson(parsed) !== body) throw new SnapshotStoreError("CORRUPT_SNAPSHOT_BODY", "snapshot body is not canonical JSON");
  return parsed;
}

function validateSerializedSnapshot(snapshot: unknown): asserts snapshot is SerializedSliceBSnapshot {
  if (!isPlainRecord(snapshot) || typeof snapshot.hash !== "string" || typeof snapshot.body !== "string") {
    throw new SnapshotStoreError("INVALID_SNAPSHOT", "snapshot must contain string hash and body fields");
  }
  if (!/^[0-9a-f]{64}$/.test(snapshot.hash)) throw new SnapshotStoreError("INVALID_SNAPSHOT", "snapshot hash must be a SHA-256 hex digest");
  parseSnapshotBody(snapshot.body);
  if (snapshotHashForBody(snapshot.body) !== snapshot.hash) throw new SnapshotStoreError("CORRUPT_SNAPSHOT_HASH", "snapshot hash does not match its body");
}

export function assertSerializedSliceBSnapshot(snapshot: unknown): asserts snapshot is SerializedSliceBSnapshot {
  validateSerializedSnapshot(snapshot);
}

function validateScopeId(scopeId: unknown): asserts scopeId is string {
  if (typeof scopeId !== "string" || scopeId.length === 0 || scopeId.trim() !== scopeId || scopeId.includes("\u0000")) {
    throw new SnapshotStoreError("INVALID_SCOPE", "scopeId must be a nonempty trimmed string without NUL");
  }
}

function validateSequence(sequence: unknown): asserts sequence is number {
  if (typeof sequence !== "number" || !Number.isSafeInteger(sequence) || sequence < 1) throw new SnapshotStoreError("NON_MONOTONIC_CHECKPOINT", "checkpoint sequence must be a positive safe integer");
}

function validateSavedAt(savedAt: unknown): asserts savedAt is number {
  if (typeof savedAt !== "number" || !Number.isFinite(savedAt) || savedAt < 0) throw new SnapshotStoreError("CORRUPT_RECORD", "savedAt must be a finite nonnegative number");
}

function validateRecord(value: unknown, expectedScopeId?: string): asserts value is PersistedSnapshotRecord {
  if (!isPlainRecord(value)) throw new SnapshotStoreError("CORRUPT_RECORD", "checkpoint record must be a plain object");
  const allowed = new Set(["storageSchemaVersion", "scopeId", "sequence", "savedAt", "snapshot"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new SnapshotStoreError("CORRUPT_RECORD", "checkpoint record contains an unsupported field");
  if (value.storageSchemaVersion !== DURABLE_STORAGE_SCHEMA_VERSION) throw new SnapshotStoreError("CORRUPT_RECORD", "unsupported durable storage schema");
  validateScopeId(value.scopeId);
  if (expectedScopeId !== undefined && value.scopeId !== expectedScopeId) throw new SnapshotStoreError("SCOPE_MISMATCH", "checkpoint record scope does not match requested scope");
  validateSequence(value.sequence);
  validateSavedAt(value.savedAt);
  try {
    validateSerializedSnapshot(value.snapshot);
  } catch (error) {
    if (error instanceof SnapshotStoreError && error.code !== "CORRUPT_RECORD") throw new SnapshotStoreError("CORRUPT_RECORD", `embedded snapshot is invalid: ${error.code}`);
    throw error;
  }
}

function scopeDigest(scopeId: string): string {
  return createHash("sha256").update(scopeId, "utf8").digest("hex");
}

export class DurableSnapshotStore {
  private readonly rootDir: string;
  private readonly clock: () => number;

  constructor(rootDir: string, options: { readonly clock?: () => number } = {}) {
    if (typeof rootDir !== "string" || rootDir.length === 0) throw new SnapshotStoreError("INVALID_SCOPE", "rootDir must be a nonempty string");
    this.rootDir = rootDir;
    this.clock = options.clock ?? (() => Date.now());
  }

  async checkpoint(scopeId: string, snapshot: SerializedSliceBSnapshot, options: CheckpointOptions = {}): Promise<CheckpointResult> {
    validateScopeId(scopeId);
    validateSerializedSnapshot(snapshot);
    if (options.sequence !== undefined) validateSequence(options.sequence);
    if (options.savedAt !== undefined) validateSavedAt(options.savedAt);
    if (options.expectedPreviousHash !== undefined && options.expectedPreviousHash !== null && !/^[0-9a-f]{64}$/.test(options.expectedPreviousHash)) throw new SnapshotStoreError("STALE_CHECKPOINT", "expectedPreviousHash must be a SHA-256 hex digest or null");

    const current = await this.readRecord(scopeId);
    if (options.expectedPreviousHash !== undefined && options.expectedPreviousHash !== (current?.snapshot.hash ?? null)) throw new SnapshotStoreError("STALE_CHECKPOINT", "checkpoint predecessor hash does not match durable state");
    if (current && current.snapshot.hash === snapshot.hash && current.snapshot.body === snapshot.body) return { status: "DUPLICATE", record: current };

    const sequence = options.sequence ?? (current ? current.sequence + 1 : 1);
    validateSequence(sequence);
    if (current && sequence !== current.sequence + 1) throw new SnapshotStoreError("NON_MONOTONIC_CHECKPOINT", "checkpoint sequence must advance exactly one step");
    if (!current && sequence !== 1) throw new SnapshotStoreError("NON_MONOTONIC_CHECKPOINT", "the first checkpoint sequence must be one");

    const record: PersistedSnapshotRecord = {
      storageSchemaVersion: DURABLE_STORAGE_SCHEMA_VERSION,
      scopeId,
      sequence,
      savedAt: options.savedAt ?? this.clock(),
      snapshot: { hash: snapshot.hash, body: snapshot.body },
    };
    validateSavedAt(record.savedAt);
    const target = this.recordPath(scopeId);
    await this.writeAtomically(target, record);
    const written = await this.readRecord(scopeId);
    if (!written || written.scopeId !== scopeId || written.sequence !== record.sequence || written.snapshot.hash !== record.snapshot.hash || written.snapshot.body !== record.snapshot.body) throw new SnapshotStoreError("WRITE_FAILED", "durable checkpoint did not verify after atomic commit");
    return { status: "STORED", record: written };
  }

  async recover(scopeId: string): Promise<PersistedSnapshotRecord | null> {
    validateScopeId(scopeId);
    return this.readRecord(scopeId);
  }

  private scopeDirectory(scopeId: string): string {
    return join(this.rootDir, "scopes", scopeDigest(scopeId));
  }

  private recordPath(scopeId: string): string {
    return join(this.scopeDirectory(scopeId), "checkpoint.json");
  }

  private async readRecord(scopeId: string): Promise<PersistedSnapshotRecord | null> {
    const target = this.recordPath(scopeId);
    let contents: string;
    try {
      contents = await readFile(target, "utf8");
    } catch (error) {
      if (isMissingFile(error)) return null;
      throw new SnapshotStoreError("CORRUPT_RECORD", "checkpoint file could not be read");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(contents) as unknown;
    } catch {
      throw new SnapshotStoreError("CORRUPT_RECORD", "checkpoint file is not valid JSON");
    }
    try {
      validateRecord(parsed, scopeId);
    } catch (error) {
      if (error instanceof SnapshotStoreError) throw error;
      throw new SnapshotStoreError("CORRUPT_RECORD", "checkpoint file failed validation");
    }
    return parsed;
  }

  private async writeAtomically(target: string, record: PersistedSnapshotRecord): Promise<void> {
    const directory = dirname(target);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = join(directory, `.checkpoint.${process.pid}.${randomUUID()}.tmp`);
    const contents = JSON.stringify(record);
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(temporary, "wx", 0o600);
      await handle.writeFile(contents, "utf8");
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporary, target);
      try {
        const directoryHandle = await open(directory, "r");
        try {
          await directoryHandle.sync();
        } finally {
          await directoryHandle.close();
        }
      } catch {
        // Directory fsync is best effort on filesystems that do not support it.
      }
    } finally {
      if (handle) await handle.close().catch(() => undefined);
      await rm(temporary, { force: true }).catch(() => undefined);
    }
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && (error as Error & { code?: unknown }).code === "ENOENT";
}
