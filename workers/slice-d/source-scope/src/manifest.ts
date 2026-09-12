import { createHash } from "node:crypto";

export const SOURCE_SCOPE_MANIFEST_VERSION = "slice-d-source-scope-v1" as const;
export const SOURCE_DOMAIN = "ethereum-sepolia" as const;
export const CHAIN_KEY = 1 as const;
export const EVM_CHAIN_ID = 11155111 as const;
export const EVENT_SCHEMA_VERSION = "slice-d-source-event-v1" as const;
export const ADAPTER_VERSION = "slice-d-source-adapter-v1" as const;
export const FIXTURE_CONTRACT_ADDRESS = "0x000000000000000000000000000000000000d001" as const;
export const FIXTURE_TOKEN_ADDRESS = "0x000000000000000000000000000000000000d002" as const;
export const CAPITAL_COMMITTED_SIGNATURE = "CapitalCommitted(bytes32,bytes32,bytes32,address,bytes32,address,uint256,uint64)" as const;
export const CAPITAL_COMMITTED_SELECTOR = "0xead4d892be5ba0cd9d75db59448b9c0cd9d398e8b3275ec31b9c720d9f1de2dd" as const;

export type SourceScopeMode = "FIXTURE_ONLY" | "LIVE_READ";
export type SourceScopeEvidenceClassification = "IMPLEMENTED_LOCAL" | "FIXTURE_FROM_LIVE_EVIDENCE";
export type ManifestErrorCode =
  | "INVALID_MANIFEST"
  | "MISSING_FIELD"
  | "UNSUPPORTED_SCOPE"
  | "INVALID_ADDRESS"
  | "UNSUPPORTED_EVENT"
  | "UNSUPPORTED_SCHEMA"
  | "MISSING_MAPPING"
  | "DUPLICATE_MAPPING"
  | "MODE_CONFLICT"
  | "LIVE_CONFIG_MISSING"
  | "UNSAFE_INPUT"
  | "UNSAFE_VALUE";

export interface SourceContractIdentity {
  readonly name: string;
  readonly address: string;
  readonly addressRole: "FIXTURE_IDENTIFIER" | "LIVE_DEPLOYMENT";
  readonly deploymentStatus: "FIXTURE_ONLY_NOT_DEPLOYED" | "LIVE_DEPLOYMENT";
  readonly sourceArtifact: string;
}

export interface SourceTokenIdentity {
  readonly name: string;
  readonly address: string;
  readonly addressRole: "FIXTURE_IDENTIFIER" | "LIVE_DEPLOYMENT";
  readonly deploymentStatus: "FIXTURE_ONLY_NOT_DEPLOYED" | "LIVE_DEPLOYMENT";
  readonly decimals: number;
  readonly sourceArtifact: string;
}

export interface EventField {
  readonly name: string;
  readonly type: string;
  readonly indexed: boolean;
  readonly topic: number | null;
}

export interface SourceEventFamily {
  readonly name: "CapitalCommitted";
  readonly signature: typeof CAPITAL_COMMITTED_SIGNATURE;
  readonly selector: typeof CAPITAL_COMMITTED_SELECTOR;
  readonly schemaVersion: typeof EVENT_SCHEMA_VERSION;
  readonly indexedFields: readonly EventField[];
  readonly dataFields: readonly EventField[];
}

export interface FinalityPolicy {
  readonly version: "slice-d-fixture-finality-v1";
  readonly mode: "CONFIRMATION_DEPTH";
  readonly depth: number;
}

export interface CursorSemantics {
  readonly mode: "SPARSE_EVENT";
  readonly unit: "BLOCK";
  readonly maxRange: number;
}

export interface RelationshipMapping {
  readonly mappingId: string;
  readonly eventFamily: "CapitalCommitted";
  readonly sourceField: "sourceCommitmentId";
  readonly relationshipIdTemplate: string;
  readonly objectIdField: "sourceCommitmentId";
  readonly objectType: "Commitment";
  readonly scope: "RELATIONSHIP_SCOPED";
  readonly mappingMode: "FIXTURE_ONLY";
}

export interface LiveReadStatus {
  readonly available: boolean;
  readonly status: "NOT_VERIFIED" | "AVAILABLE";
  readonly deploymentFieldsPresent: boolean;
  readonly reason: string;
}

export interface LiveDeploymentFields {
  readonly contractAddress: string;
  readonly tokenAddress: string;
  readonly relationshipMappingVersion: string;
}

export interface FixtureContext {
  readonly abiSource: string;
  readonly tokenSource: string;
  readonly historicalEvidence: string;
  readonly addressesUse: "DETERMINISTIC_IDENTIFIERS_ONLY";
  readonly relationshipUse: "LOCAL_FIXTURE_MAPPING_ONLY";
}

export interface SourceScopeManifestInput {
  readonly manifestVersion?: string;
  readonly scopeId?: string;
  readonly sourceDomain?: string;
  readonly chainKey?: number;
  readonly evmChainId?: number;
  readonly contract?: SourceContractIdentity;
  readonly token?: SourceTokenIdentity;
  readonly eventFamily?: SourceEventFamily;
  readonly adapterVersion?: string;
  readonly schemaVersion?: string;
  readonly finalityPolicy?: FinalityPolicy;
  readonly cursor?: CursorSemantics;
  readonly relationshipMappings?: readonly RelationshipMapping[];
  readonly mode?: SourceScopeMode;
  readonly evidenceClassification?: SourceScopeEvidenceClassification;
  readonly liveRead?: LiveReadStatus;
  readonly liveDeployment?: LiveDeploymentFields;
  readonly fixtureContext?: FixtureContext;
}

export interface SourceScopeManifest extends Omit<SourceScopeManifestInput, "manifestVersion" | "scopeId" | "sourceDomain" | "chainKey" | "evmChainId" | "contract" | "token" | "eventFamily" | "adapterVersion" | "schemaVersion" | "finalityPolicy" | "cursor" | "relationshipMappings" | "mode" | "evidenceClassification" | "liveRead" | "liveDeployment" | "fixtureContext"> {
  readonly manifestVersion: typeof SOURCE_SCOPE_MANIFEST_VERSION;
  readonly scopeId: string;
  readonly sourceDomain: typeof SOURCE_DOMAIN;
  readonly chainKey: typeof CHAIN_KEY;
  readonly evmChainId: typeof EVM_CHAIN_ID;
  readonly contract: SourceContractIdentity;
  readonly token: SourceTokenIdentity;
  readonly eventFamily: SourceEventFamily;
  readonly adapterVersion: typeof ADAPTER_VERSION;
  readonly schemaVersion: typeof SOURCE_SCOPE_MANIFEST_VERSION;
  readonly finalityPolicy: FinalityPolicy;
  readonly cursor: CursorSemantics;
  readonly relationshipMappings: readonly RelationshipMapping[];
  readonly mode: SourceScopeMode;
  readonly evidenceClassification: SourceScopeEvidenceClassification;
  readonly liveRead: LiveReadStatus;
  readonly liveDeployment?: LiveDeploymentFields;
  readonly fixtureContext: FixtureContext;
}

export interface SerializedSourceScopeManifest {
  readonly body: string;
  readonly hash: string;
}

export class SourceScopeManifestError extends Error {
  public readonly name = "SourceScopeManifestError";

  public constructor(public readonly code: ManifestErrorCode, message: string) {
    super(`${code}: ${message}`);
  }
}

const ROOT_KEYS = [
  "adapterVersion",
  "chainKey",
  "contract",
  "cursor",
  "evmChainId",
  "eventFamily",
  "evidenceClassification",
  "finalityPolicy",
  "fixtureContext",
  "liveRead",
  "manifestVersion",
  "mode",
  "relationshipMappings",
  "schemaVersion",
  "scopeId",
  "sourceDomain",
  "token",
] as const;

function fail(code: ManifestErrorCode, message: string): never {
  throw new SourceScopeManifestError(code, message);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    return Object.keys(value).every((key) => {
      if (["__proto__", "constructor", "prototype"].includes(key)) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor !== undefined && "value" in descriptor;
    });
  } catch {
    return false;
  }
}

function canonicalize(value: unknown, ancestors = new Set<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("UNSAFE_VALUE", "numbers must be finite");
    return value;
  }
  if (typeof value !== "object") fail("UNSAFE_VALUE", "manifest contains an unsupported value type");
  if (ancestors.has(value)) fail("UNSAFE_INPUT", "manifest contains a cycle");
  if (!isPlainRecord(value) && !Array.isArray(value)) fail("UNSAFE_INPUT", "manifest contains an unsafe object");
  const nextAncestors = new Set(ancestors).add(value);
  if (Array.isArray(value)) return value.map((item) => canonicalize(item, nextAncestors));
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key], nextAncestors)]));
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!isPlainRecord(value)) fail("INVALID_MANIFEST", `${field} must be a plain object`);
  return value;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], field: string, optional: readonly string[] = []): void {
  const allowed = new Set([...expected, ...optional]);
  const actual = Object.keys(value);
  const missing = expected.filter((key) => !Object.prototype.hasOwnProperty.call(value, key));
  if (missing.length > 0) fail("MISSING_FIELD", `${field} is missing ${missing.join(", ")}`);
  if (actual.some((key) => !allowed.has(key))) fail("INVALID_MANIFEST", `${field} has an unsupported field`);
}

function stringValue(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) fail("MISSING_FIELD", `${field} must be a nonempty trimmed string`);
  return value;
}

function integerValue(value: unknown, field: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail("UNSAFE_VALUE", `${field} must be a safe integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function booleanValue(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") fail("UNSAFE_VALUE", `${field} must be boolean`);
  return value;
}

function addressValue(value: unknown, field: string): string {
  const address = stringValue(value, field);
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) fail("INVALID_ADDRESS", `${field} is not a 20-byte hex address`);
  return address;
}

function exactString(value: unknown, expected: string, field: string): string {
  const actual = stringValue(value, field);
  if (actual !== expected) fail("UNSUPPORTED_SCHEMA", `${field} must be ${expected}`);
  return actual;
}

function expectedFields(value: unknown, expected: readonly EventField[], field: string): readonly EventField[] {
  if (!Array.isArray(value) || value.length !== expected.length) fail("UNSUPPORTED_EVENT", `${field} has the wrong field count`);
  const actual = value.map((item, index) => {
    const entry = record(item, `${field}[${index}]`);
    exactKeys(entry, ["indexed", "name", "topic", "type"], `${field}[${index}]`);
    return {
      name: stringValue(entry.name, `${field}[${index}].name`),
      type: stringValue(entry.type, `${field}[${index}].type`),
      indexed: booleanValue(entry.indexed, `${field}[${index}].indexed`),
      topic: entry.topic === null ? null : integerValue(entry.topic, `${field}[${index}].topic`, 1, 4),
    };
  });
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail("UNSUPPORTED_EVENT", `${field} does not match the repository ABI`);
  return actual;
}

function parseManifest(input: unknown): SourceScopeManifest {
  let normalized: unknown;
  try {
    normalized = canonicalize(input);
  } catch (error) {
    if (error instanceof SourceScopeManifestError) throw error;
    fail("UNSAFE_INPUT", "manifest could not be safely inspected");
  }
  const root = record(normalized, "manifest");
  exactKeys(root, ROOT_KEYS, "manifest", ["liveDeployment"]);
  exactString(root.manifestVersion, SOURCE_SCOPE_MANIFEST_VERSION, "manifestVersion");
  const scopeId = stringValue(root.scopeId, "scopeId");
  if (scopeId !== "source-scope:ethereum-sepolia:capital-committed:fixture-v1") fail("UNSUPPORTED_SCOPE", "unsupported source scope");
  if (root.sourceDomain !== SOURCE_DOMAIN || root.chainKey !== CHAIN_KEY || root.evmChainId !== EVM_CHAIN_ID) fail("UNSUPPORTED_SCOPE", "source domain and chain identity must be Ethereum Sepolia chain key 1 / 11155111");

  const contract = record(root.contract, "contract");
  exactKeys(contract, ["address", "addressRole", "deploymentStatus", "name", "sourceArtifact"], "contract");
  const contractName = stringValue(contract.name, "contract.name");
  if (contractName !== "CapitalCommitmentVault") fail("UNSUPPORTED_EVENT", "unsupported source contract");
  const contractAddress = addressValue(contract.address, "contract.address");
  const contractRole = stringValue(contract.addressRole, "contract.addressRole");
  const contractStatus = stringValue(contract.deploymentStatus, "contract.deploymentStatus");
  stringValue(contract.sourceArtifact, "contract.sourceArtifact");

  const token = record(root.token, "token");
  exactKeys(token, ["address", "addressRole", "decimals", "deploymentStatus", "name", "sourceArtifact"], "token");
  const tokenName = stringValue(token.name, "token.name");
  if (tokenName !== "MockERC20") fail("UNSUPPORTED_EVENT", "unsupported fixture token");
  const tokenAddress = addressValue(token.address, "token.address");
  const tokenRole = stringValue(token.addressRole, "token.addressRole");
  const tokenStatus = stringValue(token.deploymentStatus, "token.deploymentStatus");
  const decimals = integerValue(token.decimals, "token.decimals", 0, 255);
  stringValue(token.sourceArtifact, "token.sourceArtifact");

  const eventFamily = record(root.eventFamily, "eventFamily");
  exactKeys(eventFamily, ["dataFields", "indexedFields", "name", "schemaVersion", "selector", "signature"], "eventFamily");
  if (eventFamily.name !== "CapitalCommitted" || eventFamily.signature !== CAPITAL_COMMITTED_SIGNATURE || eventFamily.selector !== CAPITAL_COMMITTED_SELECTOR) fail("UNSUPPORTED_EVENT", "event family does not match CapitalCommitmentVault.CapitalCommitted");
  exactString(eventFamily.schemaVersion, EVENT_SCHEMA_VERSION, "eventFamily.schemaVersion");
  const indexedFields = expectedFields(eventFamily.indexedFields, [
    { name: "sourceCommitmentId", type: "bytes32", indexed: true, topic: 1 },
    { name: "facilityId", type: "bytes32", indexed: true, topic: 2 },
    { name: "allocationId", type: "bytes32", indexed: true, topic: 3 },
  ], "eventFamily.indexedFields");
  const dataFields = expectedFields(eventFamily.dataFields, [
    { name: "provider", type: "address", indexed: false, topic: null },
    { name: "assetClassId", type: "bytes32", indexed: false, topic: null },
    { name: "token", type: "address", indexed: false, topic: null },
    { name: "amount", type: "uint256", indexed: false, topic: null },
    { name: "expiresAt", type: "uint64", indexed: false, topic: null },
  ], "eventFamily.dataFields");

  exactString(root.adapterVersion, ADAPTER_VERSION, "adapterVersion");
  exactString(root.schemaVersion, SOURCE_SCOPE_MANIFEST_VERSION, "schemaVersion");

  const finality = record(root.finalityPolicy, "finalityPolicy");
  exactKeys(finality, ["depth", "mode", "version"], "finalityPolicy");
  exactString(finality.version, "slice-d-fixture-finality-v1", "finalityPolicy.version");
  exactString(finality.mode, "CONFIRMATION_DEPTH", "finalityPolicy.mode");
  const finalityDepth = integerValue(finality.depth, "finalityPolicy.depth", 1, 1024);

  const cursor = record(root.cursor, "cursor");
  exactKeys(cursor, ["maxRange", "mode", "unit"], "cursor");
  exactString(cursor.mode, "SPARSE_EVENT", "cursor.mode");
  exactString(cursor.unit, "BLOCK", "cursor.unit");
  const maxRange = integerValue(cursor.maxRange, "cursor.maxRange", 1, 1_000_000);

  if (!Array.isArray(root.relationshipMappings) || root.relationshipMappings.length === 0) fail("MISSING_MAPPING", "at least one relationship mapping is required");
  const mappingIds = new Set<string>();
  const mappingKeys = new Set<string>();
  const relationshipMappings = root.relationshipMappings.map((item, index) => {
    const mapping = record(item, `relationshipMappings[${index}]`);
    exactKeys(mapping, ["eventFamily", "mappingId", "mappingMode", "objectIdField", "objectType", "relationshipIdTemplate", "scope", "sourceField"], `relationshipMappings[${index}]`);
    const mappingId = stringValue(mapping.mappingId, `relationshipMappings[${index}].mappingId`);
    const eventName = stringValue(mapping.eventFamily, `relationshipMappings[${index}].eventFamily`);
    const sourceField = stringValue(mapping.sourceField, `relationshipMappings[${index}].sourceField`);
    const objectIdField = stringValue(mapping.objectIdField, `relationshipMappings[${index}].objectIdField`);
    const template = stringValue(mapping.relationshipIdTemplate, `relationshipMappings[${index}].relationshipIdTemplate`);
    const objectType = stringValue(mapping.objectType, `relationshipMappings[${index}].objectType`);
    const scope = stringValue(mapping.scope, `relationshipMappings[${index}].scope`);
    const mappingMode = stringValue(mapping.mappingMode, `relationshipMappings[${index}].mappingMode`);
    if (mappingIds.has(mappingId)) fail("DUPLICATE_MAPPING", `duplicate mappingId ${mappingId}`);
    const key = `${eventName}|${sourceField}|${objectIdField}|${scope}`;
    if (mappingKeys.has(key)) fail("DUPLICATE_MAPPING", `conflicting duplicate mapping ${key}`);
    mappingIds.add(mappingId);
    mappingKeys.add(key);
    if (eventName !== "CapitalCommitted" || sourceField !== "sourceCommitmentId" || objectIdField !== "sourceCommitmentId" || objectType !== "Commitment" || scope !== "RELATIONSHIP_SCOPED" || mappingMode !== "FIXTURE_ONLY") fail("UNSUPPORTED_EVENT", `unsupported relationship mapping at index ${index}`);
    if (template !== "relationship:fixture:capital-commitment:{sourceCommitmentId}") fail("UNSUPPORTED_SCOPE", "fixture relationship template is not the declared mapping");
    return { mappingId, eventFamily: "CapitalCommitted" as const, sourceField: "sourceCommitmentId" as const, relationshipIdTemplate: template, objectIdField: "sourceCommitmentId" as const, objectType: "Commitment" as const, scope: "RELATIONSHIP_SCOPED" as const, mappingMode: "FIXTURE_ONLY" as const };
  });

  const mode = stringValue(root.mode, "mode");
  if (mode !== "FIXTURE_ONLY" && mode !== "LIVE_READ") fail("MODE_CONFLICT", "mode must be FIXTURE_ONLY or LIVE_READ");
  const evidenceClassification = stringValue(root.evidenceClassification, "evidenceClassification");
  if (evidenceClassification !== "IMPLEMENTED_LOCAL" && evidenceClassification !== "FIXTURE_FROM_LIVE_EVIDENCE") fail("UNSUPPORTED_SCOPE", "unsupported evidence classification");

  const liveRead = record(root.liveRead, "liveRead");
  exactKeys(liveRead, ["available", "deploymentFieldsPresent", "reason", "status"], "liveRead");
  const liveAvailable = booleanValue(liveRead.available, "liveRead.available");
  const deploymentFieldsPresent = booleanValue(liveRead.deploymentFieldsPresent, "liveRead.deploymentFieldsPresent");
  const liveStatus = stringValue(liveRead.status, "liveRead.status");
  const liveReason = stringValue(liveRead.reason, "liveRead.reason");
  if (liveStatus !== "NOT_VERIFIED" && liveStatus !== "AVAILABLE") fail("MODE_CONFLICT", "unsupported live-read status");

  const fixtureContext = record(root.fixtureContext, "fixtureContext");
  exactKeys(fixtureContext, ["abiSource", "addressesUse", "historicalEvidence", "relationshipUse", "tokenSource"], "fixtureContext");
  const fixtureAbiSource = stringValue(fixtureContext.abiSource, "fixtureContext.abiSource");
  const fixtureTokenSource = stringValue(fixtureContext.tokenSource, "fixtureContext.tokenSource");
  const historicalEvidence = stringValue(fixtureContext.historicalEvidence, "fixtureContext.historicalEvidence");
  if (fixtureContext.addressesUse !== "DETERMINISTIC_IDENTIFIERS_ONLY" || fixtureContext.relationshipUse !== "LOCAL_FIXTURE_MAPPING_ONLY") fail("MODE_CONFLICT", "fixture context must remain fixture-only");

  let liveDeployment: LiveDeploymentFields | undefined;
  if (root.liveDeployment !== undefined) {
    const deployment = record(root.liveDeployment, "liveDeployment");
    exactKeys(deployment, ["contractAddress", "relationshipMappingVersion", "tokenAddress"], "liveDeployment");
    liveDeployment = {
      contractAddress: addressValue(deployment.contractAddress, "liveDeployment.contractAddress"),
      tokenAddress: addressValue(deployment.tokenAddress, "liveDeployment.tokenAddress"),
      relationshipMappingVersion: stringValue(deployment.relationshipMappingVersion, "liveDeployment.relationshipMappingVersion"),
    };
  }

  if (mode === "FIXTURE_ONLY") {
    if (contractRole !== "FIXTURE_IDENTIFIER" || tokenRole !== "FIXTURE_IDENTIFIER" || contractStatus !== "FIXTURE_ONLY_NOT_DEPLOYED" || tokenStatus !== "FIXTURE_ONLY_NOT_DEPLOYED") fail("MODE_CONFLICT", "FIXTURE_ONLY requires fixture identifiers and non-deployed status");
    if (contractAddress !== FIXTURE_CONTRACT_ADDRESS || tokenAddress !== FIXTURE_TOKEN_ADDRESS) fail("MODE_CONFLICT", "FIXTURE_ONLY addresses must be the declared deterministic identifiers");
    if (liveAvailable || deploymentFieldsPresent || liveStatus !== "NOT_VERIFIED" || liveDeployment !== undefined) fail("MODE_CONFLICT", "FIXTURE_ONLY cannot claim live-read availability or deployment fields");
  } else {
    if (contractRole !== "LIVE_DEPLOYMENT" || tokenRole !== "LIVE_DEPLOYMENT" || contractStatus !== "LIVE_DEPLOYMENT" || tokenStatus !== "LIVE_DEPLOYMENT" || !liveAvailable || !deploymentFieldsPresent || liveStatus !== "AVAILABLE" || liveDeployment === undefined) fail("LIVE_CONFIG_MISSING", "LIVE_READ requires verified live deployment and relationship mapping fields");
    if (liveDeployment.contractAddress !== contractAddress || liveDeployment.tokenAddress !== tokenAddress) fail("LIVE_CONFIG_MISSING", "live deployment fields must match contract and token identities");
  }

  return Object.freeze({
    manifestVersion: SOURCE_SCOPE_MANIFEST_VERSION,
    scopeId,
    sourceDomain: SOURCE_DOMAIN,
    chainKey: CHAIN_KEY,
    evmChainId: EVM_CHAIN_ID,
    contract: Object.freeze({ name: contractName, address: contractAddress, addressRole: contractRole as SourceContractIdentity["addressRole"], deploymentStatus: contractStatus as SourceContractIdentity["deploymentStatus"], sourceArtifact: stringValue(contract.sourceArtifact, "contract.sourceArtifact") }),
    token: Object.freeze({ name: tokenName, address: tokenAddress, addressRole: tokenRole as SourceTokenIdentity["addressRole"], deploymentStatus: tokenStatus as SourceTokenIdentity["deploymentStatus"], decimals, sourceArtifact: stringValue(token.sourceArtifact, "token.sourceArtifact") }),
    eventFamily: Object.freeze({ name: "CapitalCommitted" as const, signature: CAPITAL_COMMITTED_SIGNATURE, selector: CAPITAL_COMMITTED_SELECTOR, schemaVersion: EVENT_SCHEMA_VERSION, indexedFields: Object.freeze(indexedFields), dataFields: Object.freeze(dataFields) }),
    adapterVersion: ADAPTER_VERSION,
    schemaVersion: SOURCE_SCOPE_MANIFEST_VERSION,
    finalityPolicy: Object.freeze({ version: "slice-d-fixture-finality-v1" as const, mode: "CONFIRMATION_DEPTH" as const, depth: finalityDepth }),
    cursor: Object.freeze({ mode: "SPARSE_EVENT" as const, unit: "BLOCK" as const, maxRange }),
    relationshipMappings: Object.freeze(relationshipMappings),
    mode: mode as SourceScopeMode,
    evidenceClassification: evidenceClassification as SourceScopeEvidenceClassification,
    liveRead: Object.freeze({ available: liveAvailable, status: liveStatus as LiveReadStatus["status"], deploymentFieldsPresent, reason: liveReason }),
    ...(liveDeployment === undefined ? {} : { liveDeployment: Object.freeze(liveDeployment) }),
    fixtureContext: Object.freeze({ abiSource: fixtureAbiSource, tokenSource: fixtureTokenSource, historicalEvidence, addressesUse: "DETERMINISTIC_IDENTIFIERS_ONLY" as const, relationshipUse: "LOCAL_FIXTURE_MAPPING_ONLY" as const }),
  });
}

export function parseSourceScopeManifest(input: unknown): SourceScopeManifest {
  return parseManifest(input);
}

export function manifestHashForBody(body: string): string {
  if (typeof body !== "string" || body.length === 0) fail("INVALID_MANIFEST", "serialized manifest body must be a nonempty string");
  return createHash("sha256").update(body, "utf8").digest("hex");
}

export function serializeSourceScopeManifest(input: SourceScopeManifestInput): SerializedSourceScopeManifest {
  const parsed = parseManifest(input);
  const body = JSON.stringify(canonicalize(parsed));
  return Object.freeze({ body, hash: manifestHashForBody(body) });
}
