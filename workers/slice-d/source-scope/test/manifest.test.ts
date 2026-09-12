import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  SourceScopeManifestError,
  parseSourceScopeManifest,
  serializeSourceScopeManifest,
} from "../src/manifest.js";

type MutableManifest = any;

function fixtureInput(): MutableManifest {
  return JSON.parse(readFileSync("workers/slice-d/source-scope/manifest.json", "utf8"));
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function expectCode(run: () => unknown, code: SourceScopeManifestError["code"]): void {
  assert.throws(
    run,
    (error: unknown) => error instanceof SourceScopeManifestError && error.code === code,
  );
}

function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .reverse()
        .map((key) => [key, reverseKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

test("checked-in fixture-only source scope is strict and serializable", () => {
  const parsed = parseSourceScopeManifest(fixtureInput());

  assert.equal(parsed.scopeId, "source-scope:ethereum-sepolia:capital-committed:fixture-v1");
  assert.equal(parsed.sourceDomain, "ethereum-sepolia");
  assert.equal(parsed.chainKey, 1);
  assert.equal(parsed.evmChainId, 11155111);
  assert.equal(parsed.mode, "FIXTURE_ONLY");
  assert.equal(parsed.eventFamily.name, "CapitalCommitted");
  assert.equal(parsed.eventFamily.selector, "0xead4d892be5ba0cd9d75db59448b9c0cd9d398e8b3275ec31b9c720d9f1de2dd");
  assert.equal(parsed.token.decimals, 18);
  assert.equal(parsed.relationshipMappings.length, 1);
  assert.equal(parsed.liveRead.available, false);
  assert.equal(parsed.liveRead.status, "NOT_VERIFIED");

  const serialized = serializeSourceScopeManifest(parsed);
  assert.match(serialized.body, /^\{"adapterVersion"/);
  assert.match(serialized.hash, /^[0-9a-f]{64}$/);
});

test("missing required fields fail closed", () => {
  const input = clone(fixtureInput());
  delete input.scopeId;
  expectCode(() => parseSourceScopeManifest(input), "MISSING_FIELD");
});

test("wrong chain identity and source domain fail closed", () => {
  const wrongChain = clone(fixtureInput());
  wrongChain.evmChainId = 1;
  expectCode(() => parseSourceScopeManifest(wrongChain), "UNSUPPORTED_SCOPE");

  const wrongDomain = clone(fixtureInput());
  wrongDomain.sourceDomain = "ethereum-mainnet";
  expectCode(() => parseSourceScopeManifest(wrongDomain), "UNSUPPORTED_SCOPE");
});

test("malformed contract and token addresses fail closed", () => {
  const badContract = clone(fixtureInput());
  badContract.contract.address = "0xnot-an-address";
  expectCode(() => parseSourceScopeManifest(badContract), "INVALID_ADDRESS");

  const badToken = clone(fixtureInput());
  badToken.token.address = "0x1234";
  expectCode(() => parseSourceScopeManifest(badToken), "INVALID_ADDRESS");
});

test("unsupported event and schema definitions fail closed", () => {
  const badEvent = clone(fixtureInput());
  badEvent.eventFamily.name = "CapitalConsumed";
  expectCode(() => parseSourceScopeManifest(badEvent), "UNSUPPORTED_EVENT");

  const badSchema = clone(fixtureInput());
  badSchema.eventFamily.schemaVersion = "slice-d-source-event-v999";
  expectCode(() => parseSourceScopeManifest(badSchema), "UNSUPPORTED_SCHEMA");
});

test("missing relationship mapping fails closed", () => {
  const input = clone(fixtureInput());
  input.relationshipMappings = [];
  expectCode(() => parseSourceScopeManifest(input), "MISSING_MAPPING");
});

test("conflicting duplicate relationship mappings fail closed", () => {
  const input = clone(fixtureInput());
  input.relationshipMappings.push({
    ...input.relationshipMappings[0]!,
    mappingId: "fixture-capital-commitment-conflict-v1",
    relationshipIdTemplate: "relationship:fixture:other:{sourceCommitmentId}",
  });
  expectCode(() => parseSourceScopeManifest(input), "DUPLICATE_MAPPING");
});

test("fixture/live mode confusion fails closed", () => {
  const fixtureClaimsLive = clone(fixtureInput());
  fixtureClaimsLive.liveRead.available = true;
  fixtureClaimsLive.liveRead.status = "AVAILABLE";
  expectCode(() => parseSourceScopeManifest(fixtureClaimsLive), "MODE_CONFLICT");

  const liveWithoutDeployments = clone(fixtureInput());
  liveWithoutDeployments.mode = "LIVE_READ";
  liveWithoutDeployments.liveRead.available = true;
  liveWithoutDeployments.liveRead.status = "AVAILABLE";
  liveWithoutDeployments.liveRead.deploymentFieldsPresent = false;
  expectCode(() => parseSourceScopeManifest(liveWithoutDeployments), "LIVE_CONFIG_MISSING");
});

test("unsafe values fail closed", () => {
  const unsafeNumber = clone(fixtureInput());
  unsafeNumber.token.decimals = Number.NaN;
  expectCode(() => parseSourceScopeManifest(unsafeNumber), "UNSAFE_VALUE");

  const unsafeRange = clone(fixtureInput());
  unsafeRange.cursor.maxRange = -1;
  expectCode(() => parseSourceScopeManifest(unsafeRange), "UNSAFE_VALUE");

  const cyclic = fixtureInput() as Record<string, unknown>;
  cyclic.cycle = cyclic;
  expectCode(() => parseSourceScopeManifest(cyclic), "UNSAFE_INPUT");

  const proxy = new Proxy({}, { getPrototypeOf: () => { throw new Error("proxy denied"); } });
  expectCode(() => parseSourceScopeManifest(proxy), "UNSAFE_INPUT");
});

test("canonical serialization and hash are insertion-order independent", () => {
  const original = parseSourceScopeManifest(fixtureInput());
  const reordered = parseSourceScopeManifest(reverseKeys(fixtureInput()));
  const left = serializeSourceScopeManifest(original);
  const right = serializeSourceScopeManifest(reordered);

  assert.equal(left.body, right.body);
  assert.equal(left.hash, right.hash);
});

test("live-read mode requires verified live deployment fields", () => {
  const input = clone(fixtureInput());
  input.mode = "LIVE_READ";
  input.contract.addressRole = "LIVE_DEPLOYMENT";
  input.token.addressRole = "LIVE_DEPLOYMENT";
  input.liveRead.available = true;
  input.liveRead.status = "AVAILABLE";
  input.liveRead.deploymentFieldsPresent = true;
  delete input.liveDeployment;

  expectCode(() => parseSourceScopeManifest(input), "LIVE_CONFIG_MISSING");
});
