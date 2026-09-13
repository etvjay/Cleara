import { createHash } from "node:crypto";
import { AbiCoder, Interface } from "ethers";
import { observationId as makeObservationId, sourceEventId as makeSourceEventId, type ObservationEnvelope, type SourceEventIdentity } from "../../../multichain-execution/src/index.js";
import type { SourceScopeManifest } from "../../source-scope/src/manifest.js";
import { SourceIngestionError } from "./errors.js";
import type {
  NormalizedSourceObservation,
  SourceBlockHeader,
  SourceChainIdentity,
  SourceLog,
  SourceObservationCoordinates,
  SourceReadBundle,
  SourceTransactionReceipt,
} from "./types.js";

const HASH = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HEX = /^0x(?:[0-9a-fA-F]{2})*$/;
const MAX_SAFE = Number.MAX_SAFE_INTEGER;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    return Reflect.ownKeys(value).every((key) => {
      if (typeof key !== "string" || ["__proto__", "constructor", "prototype"].includes(key)) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor !== undefined && descriptor.enumerable && "value" in descriptor;
    });
  } catch {
    return false;
  }
}

const TRUSTED_ARRAY_PROTOTYPE = Array.prototype;
const TRUSTED_ARRAY_DESCRIPTORS = new Map(Reflect.ownKeys(TRUSTED_ARRAY_PROTOTYPE).map((key) => [key, Object.getOwnPropertyDescriptor(TRUSTED_ARRAY_PROTOTYPE, key)!]));

function sameDescriptor(expected: PropertyDescriptor, actual: PropertyDescriptor | undefined): boolean {
  if (!actual || expected.enumerable !== actual.enumerable || expected.configurable !== actual.configurable) return false;
  if ("value" in expected || "value" in actual) return "value" in expected && "value" in actual && expected.writable === actual.writable && expected.value === actual.value;
  return expected.get === actual.get && expected.set === actual.set;
}

function trustedArrayPrototype(): boolean {
  try {
    const keys = Reflect.ownKeys(TRUSTED_ARRAY_PROTOTYPE);
    return keys.length === TRUSTED_ARRAY_DESCRIPTORS.size && [...TRUSTED_ARRAY_DESCRIPTORS].every(([key, descriptor]) => sameDescriptor(descriptor, Object.getOwnPropertyDescriptor(TRUSTED_ARRAY_PROTOTYPE, key)));
  } catch {
    return false;
  }
}

function isSafeArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value)) return false;
  try {
    if (Object.getPrototypeOf(value) !== TRUSTED_ARRAY_PROTOTYPE || !trustedArrayPrototype()) return false;
    const keys = Reflect.ownKeys(value);
    for (const key of keys) {
      if (key === "length") continue;
      if (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return false;
    }
    for (let index = 0; index < value.length; index += 1) if (!Object.prototype.hasOwnProperty.call(value, String(index))) return false;
    return true;
  } catch {
    return false;
  }
}

function assertSafe(value: unknown, field: string, ancestors = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new SourceIngestionError("UNSAFE_INPUT", `${field} contains a non-finite number`);
    return;
  }
  if (typeof value !== "object") throw new SourceIngestionError("UNSAFE_INPUT", `${field} contains an unsupported value`);
  if (ancestors.has(value)) throw new SourceIngestionError("UNSAFE_INPUT", `${field} contains a cycle`);
  if (Array.isArray(value)) {
    if (!isSafeArray(value)) throw new SourceIngestionError("UNSAFE_INPUT", `${field} contains an unsafe array`);
    const next = new Set(ancestors).add(value);
    for (const item of value) assertSafe(item, field, next);
    return;
  }
  if (!isPlainRecord(value)) throw new SourceIngestionError("UNSAFE_INPUT", `${field} contains an unsafe object`);
  const next = new Set(ancestors).add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") throw new SourceIngestionError("UNSAFE_INPUT", `${field} contains a symbol key`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw new SourceIngestionError("UNSAFE_INPUT", `${field} contains a hidden property`);
    assertSafe(descriptor.value, `${field}.${key}`, next);
  }
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (value === null) throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", `${field} must be a plain object value`);
  if (typeof value !== "object") throw new SourceIngestionError("UNSAFE_INPUT", `${field} must be a plain object value`);
  assertSafe(value, field);
  if (!isPlainRecord(value)) throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", `${field} must be a plain object`);
  return value;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], field: string): void {
  const actual = Object.keys(value).sort();
  const target = [...expected].sort();
  if (actual.length !== target.length || actual.some((key, index) => key !== target[index])) {
    throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", `${field} has an unexpected shape`);
  }
}

function safeInteger(value: unknown, field: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > MAX_SAFE) {
    throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", `${field} must be a safe integer`);
  }
  return value;
}

function hash(value: unknown, field: string): string {
  if (typeof value !== "string" || !HASH.test(value)) throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", `${field} must be a 32-byte hex hash`);
  return value.toLowerCase();
}

function address(value: unknown, field: string): string {
  if (typeof value !== "string" || !ADDRESS.test(value)) throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", `${field} must be a 20-byte hex address`);
  return value.toLowerCase();
}

function bytes32(value: unknown, field: string): string {
  if (typeof value !== "string" || !HASH.test(value)) throw new SourceIngestionError("INVALID_SOURCE_EVENT", `${field} must be bytes32`);
  return value.toLowerCase();
}

function hexData(value: unknown, field: string): string {
  if (typeof value !== "string" || !HEX.test(value)) throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", `${field} must be even-length hex data`);
  return value.toLowerCase();
}

function stringValue(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", `${field} must be a trimmed string`);
  return value;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
}

function payloadHash(payload: Readonly<Record<string, string>>): string {
  return createHash("sha256").update(canonicalJson(payload), "utf8").digest("hex");
}

function validateIdentity(value: unknown, manifest: SourceScopeManifest): SourceChainIdentity {
  const identity = record(value, "chain identity");
  exactKeys(identity, ["sourceDomain", "chainKey", "evmChainId", "adapterVersion", "schemaVersion"], "chain identity");
  const sourceDomain = stringValue(identity.sourceDomain, "sourceDomain");
  const chainKey = safeInteger(identity.chainKey, "chainKey");
  const evmChainId = safeInteger(identity.evmChainId, "evmChainId");
  const adapterVersion = stringValue(identity.adapterVersion, "adapterVersion");
  const schemaVersion = stringValue(identity.schemaVersion, "schemaVersion");
  if (sourceDomain !== manifest.sourceDomain || chainKey !== manifest.chainKey || evmChainId !== manifest.evmChainId || adapterVersion !== manifest.adapterVersion || schemaVersion !== manifest.eventFamily.schemaVersion) {
    throw new SourceIngestionError("WRONG_CHAIN_IDENTITY", "provider chain identity does not exactly match the D0 manifest");
  }
  return { sourceDomain, chainKey, evmChainId, adapterVersion, schemaVersion };
}

function validateBlock(value: unknown, field: string, expectedNumber?: number): SourceBlockHeader {
  const block = record(value, field);
  exactKeys(block, ["blockNumber", "blockHash", "parentHash", "timestamp"], field);
  const blockNumber = safeInteger(block.blockNumber, `${field}.blockNumber`);
  if (expectedNumber !== undefined && blockNumber !== expectedNumber) throw new SourceIngestionError("INCONSISTENT_SOURCE_DATA", `${field}.blockNumber does not match the requested block`);
  const blockHash = hash(block.blockHash, `${field}.blockHash`);
  const parentHash = block.parentHash === null ? null : hash(block.parentHash, `${field}.parentHash`);
  const timestamp = safeInteger(block.timestamp, `${field}.timestamp`);
  if (blockNumber === 0 && parentHash !== null) throw new SourceIngestionError("INCONSISTENT_SOURCE_DATA", "genesis block cannot have a parent hash");
  if (blockNumber > 0 && parentHash === null) throw new SourceIngestionError("INCONSISTENT_SOURCE_DATA", "non-genesis block must have a parent hash");
  return { blockNumber, blockHash, parentHash, timestamp };
}

function validateLog(value: unknown, field: string, expectedBlock?: SourceBlockHeader): SourceLog {
  const log = record(value, field);
  exactKeys(log, ["address", "topics", "data", "transactionHash", "blockNumber", "blockHash", "transactionIndex", "logIndex"], field);
  if (!Array.isArray(log.topics)) throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", `${field}.topics must be an array`);
  const topics = log.topics.map((topic, index) => {
    if (typeof topic !== "string" || !HASH.test(topic)) throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", `${field}.topics[${index}] must be a 32-byte hash`);
    return topic.toLowerCase();
  });
  const result: SourceLog = {
    address: address(log.address, `${field}.address`),
    topics,
    data: hexData(log.data, `${field}.data`),
    transactionHash: hash(log.transactionHash, `${field}.transactionHash`),
    blockNumber: safeInteger(log.blockNumber, `${field}.blockNumber`),
    blockHash: hash(log.blockHash, `${field}.blockHash`),
    transactionIndex: safeInteger(log.transactionIndex, `${field}.transactionIndex`),
    logIndex: safeInteger(log.logIndex, `${field}.logIndex`),
  };
  if (expectedBlock && (result.blockNumber !== expectedBlock.blockNumber || result.blockHash !== expectedBlock.blockHash)) {
    throw new SourceIngestionError("INCONSISTENT_SOURCE_DATA", `${field} is not included in the requested block`);
  }
  return result;
}

function validateReceipt(value: unknown, expectedBlock: SourceBlockHeader): SourceTransactionReceipt {
  const receiptValue = record(value, "transaction receipt");
  exactKeys(receiptValue, ["transactionHash", "status", "blockNumber", "blockHash", "transactionIndex", "logs"], "transaction receipt");
  const transactionHash = hash(receiptValue.transactionHash, "receipt.transactionHash");
  const status = receiptValue.status;
  if (status !== 0 && status !== 1) throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", "receipt.status must be 0 or 1");
  if (!Array.isArray(receiptValue.logs)) throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", "receipt.logs must be an array");
  const blockNumber = safeInteger(receiptValue.blockNumber, "receipt.blockNumber");
  const blockHash = hash(receiptValue.blockHash, "receipt.blockHash");
  const transactionIndex = safeInteger(receiptValue.transactionIndex, "receipt.transactionIndex");
  if (blockNumber !== expectedBlock.blockNumber || blockHash !== expectedBlock.blockHash) throw new SourceIngestionError("INCONSISTENT_SOURCE_DATA", "receipt is not included in the event block");
  const logs = receiptValue.logs.map((item, index) => validateLog(item, `receipt.logs[${index}]`, expectedBlock));
  const logIndexes = new Set<number>();
  for (const receiptLog of logs) {
    if (receiptLog.transactionHash !== transactionHash || receiptLog.transactionIndex !== transactionIndex) throw new SourceIngestionError("INCONSISTENT_SOURCE_DATA", "receipt log transaction identity differs from the receipt");
    if (logIndexes.has(receiptLog.logIndex)) throw new SourceIngestionError("INCONSISTENT_SOURCE_DATA", "receipt contains duplicate log indexes");
    logIndexes.add(receiptLog.logIndex);
  }
  return { transactionHash, status, blockNumber, blockHash, transactionIndex, logs };
}

function eventAbi(manifest: SourceScopeManifest): string {
  const fields = [...manifest.eventFamily.indexedFields, ...manifest.eventFamily.dataFields]
    .map((field) => `${field.type}${field.indexed ? " indexed" : ""} ${field.name}`)
    .join(",");
  return `event ${manifest.eventFamily.name}(${fields})`;
}

function sameLog(left: SourceLog, right: SourceLog): boolean {
  return left.address === right.address
    && left.data === right.data
    && left.transactionHash === right.transactionHash
    && left.blockNumber === right.blockNumber
    && left.blockHash === right.blockHash
    && left.transactionIndex === right.transactionIndex
    && left.logIndex === right.logIndex
    && left.topics.length === right.topics.length
    && left.topics.every((topic, index) => topic === right.topics[index]);
}

export class CapitalCommittedAdapter {
  private readonly iface: Interface;
  private readonly coder = AbiCoder.defaultAbiCoder();
  private readonly dataTypes: readonly string[];

  public constructor(private readonly manifest: SourceScopeManifest) {
    if (manifest.mode !== "FIXTURE_ONLY" && !manifest.liveDeployment) throw new SourceIngestionError("UNSUPPORTED_SCOPE", "LIVE_READ cannot be adapted without verified live deployment fields");
    if (manifest.eventFamily.name !== "CapitalCommitted") throw new SourceIngestionError("UNSUPPORTED_SCOPE", "only the D0 CapitalCommitted event family is supported");
    this.iface = new Interface([eventAbi(manifest)]);
    this.dataTypes = Object.freeze(manifest.eventFamily.dataFields.map((field) => field.type));
  }

  public adapt(bundle: SourceReadBundle): NormalizedSourceObservation {
    const identity = validateIdentity(bundle.identity, this.manifest);
    const block = validateBlock(bundle.block, "block");
    const parent = bundle.parent === null ? null : validateBlock(bundle.parent, "parent", block.blockNumber - 1);
    if (block.blockNumber > 0 && (parent === null || block.parentHash !== parent.blockHash)) throw new SourceIngestionError("INCONSISTENT_SOURCE_DATA", "block parent does not match the trusted parent header");
    const log = validateLog(bundle.log, "event log", block);
    const receipt = validateReceipt(bundle.receipt, block);
    if (receipt.transactionHash !== log.transactionHash || receipt.transactionIndex !== log.transactionIndex) throw new SourceIngestionError("INCONSISTENT_SOURCE_DATA", "receipt and log transaction identity differ");
    if (receipt.status !== 1) throw new SourceIngestionError("INVALID_SOURCE_EVENT", "source transaction receipt did not succeed");
    const matchingReceiptLogs = receipt.logs.filter((candidate) => candidate.logIndex === log.logIndex && candidate.transactionHash === log.transactionHash);
    if (matchingReceiptLogs.length !== 1 || !sameLog(matchingReceiptLogs[0], log)) throw new SourceIngestionError("INCONSISTENT_SOURCE_DATA", "event log is not exactly included in its receipt");
    if (log.address !== this.manifest.contract.address.toLowerCase()) throw new SourceIngestionError("INVALID_SOURCE_EVENT", "event contract does not match the D0 manifest");
    if (log.topics.length !== 4 || log.topics[0] !== this.manifest.eventFamily.selector.toLowerCase()) throw new SourceIngestionError("INVALID_SOURCE_EVENT", "event selector or topic layout does not match the D0 manifest");
    const sourceCommitmentId = bytes32(log.topics[1], "sourceCommitmentId");
    const facilityId = bytes32(log.topics[2], "facilityId");
    const allocationId = bytes32(log.topics[3], "allocationId");
    let decodedValues: readonly unknown[];
    try {
      const values = this.coder.decode(this.dataTypes, log.data);
      decodedValues = this.manifest.eventFamily.dataFields.map((_, index) => values[index]);
      const canonical = this.coder.encode(this.dataTypes, decodedValues);
      if (canonical.toLowerCase() !== log.data) throw new Error("noncanonical data");
    } catch {
      throw new SourceIngestionError("INVALID_SOURCE_EVENT", "event data does not decode according to the repository ABI");
    }
    let encoded: { readonly topics: readonly string[]; readonly data: string };
    try {
      encoded = this.iface.encodeEventLog(this.manifest.eventFamily.name, [sourceCommitmentId, facilityId, allocationId, ...decodedValues]);
    } catch {
      throw new SourceIngestionError("INVALID_SOURCE_EVENT", "manifest event schema cannot be encoded");
    }
    if (encoded.topics.length !== log.topics.length || encoded.topics[0].toLowerCase() !== log.topics[0] || encoded.topics.slice(1).some((topic, index) => topic.toLowerCase() !== log.topics[index + 1]) || encoded.data.toLowerCase() !== log.data) {
      throw new SourceIngestionError("INVALID_SOURCE_EVENT", "event does not match the manifest ABI layout");
    }
    const dataByName = new Map(this.manifest.eventFamily.dataFields.map((field, index) => [field.name, decodedValues[index]]));
    const providerAddress = address(dataByName.get("provider"), "provider");
    const assetClassId = bytes32(dataByName.get("assetClassId"), "assetClassId");
    const token = address(dataByName.get("token"), "token");
    const amount = BigInt(String(dataByName.get("amount")));
    const expiresAt = BigInt(String(dataByName.get("expiresAt")));
    if ([sourceCommitmentId, facilityId, allocationId, assetClassId].some((value) => /^0x0{64}$/.test(value)) || providerAddress === "0x0000000000000000000000000000000000000000") throw new SourceIngestionError("INVALID_SOURCE_EVENT", "source identifiers and provider must be nonzero");
    if (token !== this.manifest.token.address.toLowerCase()) throw new SourceIngestionError("INVALID_SOURCE_EVENT", "event token does not match the D0 manifest");
    if (amount <= 0n) throw new SourceIngestionError("INVALID_SOURCE_EVENT", "event amount must be positive");
    if (expiresAt <= BigInt(block.timestamp)) throw new SourceIngestionError("INVALID_SOURCE_EVENT", "event expiry must be after the observed block timestamp");
    const mapping = this.manifest.relationshipMappings.filter((candidate) => candidate.eventFamily === this.manifest.eventFamily.name && candidate.sourceField === "sourceCommitmentId");
    if (mapping.length !== 1) throw new SourceIngestionError("INVALID_SOURCE_EVENT", "D0 relationship mapping is missing or ambiguous");
    const relationshipMapping = mapping[0];
    const objectId = sourceCommitmentId;
    const relationshipId = relationshipMapping.relationshipIdTemplate.replace("{sourceCommitmentId}", sourceCommitmentId);
    if (relationshipId === relationshipMapping.relationshipIdTemplate || !relationshipId.includes(sourceCommitmentId)) throw new SourceIngestionError("INVALID_SOURCE_EVENT", "D0 relationship mapping did not derive an ID");
    const eventIdentity: SourceEventIdentity = { domain: identity.sourceDomain, chainKey: identity.chainKey, transactionHash: log.transactionHash, eventIndex: log.logIndex };
    const sourceEventId = makeSourceEventId(eventIdentity);
    const observationIdentifier = makeObservationId(eventIdentity, this.manifest.eventFamily.name);
    const normalizedPayload = Object.freeze({
      sourceCommitmentId,
      facilityId,
      allocationId,
      provider: providerAddress,
      assetClassId,
      token,
      tokenDecimals: String(this.manifest.token.decimals),
      amount: amount.toString(10),
      expiresAt: expiresAt.toString(10),
    });
    const observation: ObservationEnvelope = Object.freeze({
      observationId: observationIdentifier,
      sourceEventId,
      relationshipId,
      objectId,
      objectType: relationshipMapping.objectType,
      eventType: this.manifest.eventFamily.name,
      sourceDomain: identity.sourceDomain,
      chainKey: identity.chainKey,
      chainId: identity.evmChainId,
      contractAddress: log.address,
      transactionHash: log.transactionHash,
      transactionIndex: log.transactionIndex,
      eventIndex: log.logIndex,
      blockNumber: BigInt(block.blockNumber),
      blockHash: block.blockHash,
      parentBlockHash: parent?.blockHash ?? null,
      observedAt: block.timestamp,
      normalizedPayload,
      payloadSchemaVersion: this.manifest.eventFamily.schemaVersion,
      observationState: "OBSERVED",
      finalityState: "UNKNOWN",
      evidenceId: null,
      creditcoinReference: null,
      projectionReference: null,
      reconciliationReference: null,
      evidenceMode: this.manifest.evidenceClassification === "FIXTURE_FROM_LIVE_EVIDENCE" ? "fixture_from_live_evidence" : "implemented_local",
      adapterVersion: this.manifest.adapterVersion,
      createdAt: block.timestamp,
      updatedAt: block.timestamp,
    });
    const coordinates: SourceObservationCoordinates = Object.freeze({
      transactionHash: log.transactionHash,
      transactionIndex: log.transactionIndex,
      logIndex: log.logIndex,
      eventIndex: log.logIndex,
      blockNumber: block.blockNumber,
      blockHash: block.blockHash,
      parentBlockHash: parent?.blockHash ?? null,
      receiptStatus: receipt.status,
    });
    return Object.freeze({
      observation,
      payloadHash: payloadHash(normalizedPayload),
      sourceEventId,
      observationId: observationIdentifier,
      evidenceStatus: "PENDING_PROOF",
      reconciliationStatus: "RECONCILIATION_PENDING",
      coordinates,
    });
  }

  public validateChainIdentity(value: unknown): SourceChainIdentity {
    return validateIdentity(value, this.manifest);
  }
}

export { validateBlock, validateIdentity, validateLog, validateReceipt };
