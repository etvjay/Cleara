import assert from "node:assert/strict";
import test from "node:test";
import { CapitalCommittedAdapter } from "../src/adapter.js";
import { SourceIngestionError } from "../src/errors.js";
import { DeterministicFixtureProvider } from "../src/fixture-provider.js";
import { fixtureDataset, identity, makeEvent, manifest, manifestCopy } from "./fixtures.js";

async function validBundle() {
  const provider = new DeterministicFixtureProvider(fixtureDataset());
  const block = await provider.getBlockHeader(manifest, 10);
  const parent = await provider.getBlockHeader(manifest, 9);
  const logs = await provider.getLogs(manifest, {
    address: manifest.contract.address,
    topic0: manifest.eventFamily.selector,
    fromBlock: 10,
    toBlock: 10,
  });
  const receipt = await provider.getTransactionReceipt(manifest, logs[0]!.transactionHash);
  return { identity: await provider.getChainIdentity(manifest), block, parent, log: logs[0], receipt };
}

function expectCode(run: () => unknown, code: SourceIngestionError["code"]): void {
  assert.throws(run, (error: unknown) => error instanceof SourceIngestionError && error.code === code);
}

test("adapter validates and maps a CapitalCommitted fixture to a complete observation", async () => {
  const adapted = new CapitalCommittedAdapter(manifest).adapt(await validBundle());
  const sourceId = "0x" + "0".repeat(63) + "1";

  assert.equal(adapted.observation.objectId, sourceId);
  assert.equal(adapted.observation.relationshipId, `relationship:fixture:capital-commitment:${sourceId}`);
  assert.equal(adapted.observation.objectType, "Commitment");
  assert.equal(adapted.observation.sourceDomain, "ethereum-sepolia");
  assert.equal(adapted.observation.chainKey, 1);
  assert.equal(adapted.observation.chainId, 11155111);
  assert.equal(adapted.observation.contractAddress, manifest.contract.address);
  assert.equal(adapted.observation.eventType, "CapitalCommitted");
  assert.equal(adapted.observation.finalityState, "UNKNOWN");
  assert.equal(adapted.observation.evidenceId, null);
  assert.equal(adapted.observation.normalizedPayload.tokenDecimals, "18");
  assert.equal(adapted.evidenceStatus, "PENDING_PROOF");
  assert.equal(adapted.reconciliationStatus, "RECONCILIATION_PENDING");
  assert.equal(adapted.coordinates.logIndex, 0);
  assert.equal(adapted.coordinates.eventIndex, 0);
  assert.equal(adapted.coordinates.receiptStatus, 1);
  assert.match(adapted.payloadHash, /^[0-9a-f]{64}$/);
});

test("adapter output identity and payload hash are deterministic", async () => {
  const adapter = new CapitalCommittedAdapter(manifest);
  const first = adapter.adapt(await validBundle());
  const second = adapter.adapt(await validBundle());
  assert.deepEqual(first, second);
});

test("adapter rejects chain, source-domain, adapter, and schema identity drift", async () => {
  const bundle = await validBundle();
  const cases = [
    { chainKey: 2 },
    { sourceDomain: "ethereum-mainnet" },
    { adapterVersion: "other-adapter-v1" },
    { schemaVersion: "other-event-v1" },
  ];
  for (const mutation of cases) {
    expectCode(() => new CapitalCommittedAdapter(manifest).adapt({ ...bundle, identity: { ...identity, ...mutation } }), "WRONG_CHAIN_IDENTITY");
  }
});

test("adapter rejects wrong contract, token, and selector", async () => {
  const bundle = await validBundle();

  const wrongContractLog = { ...bundle.log!, address: "0x000000000000000000000000000000000000d099" };
  const wrongContract = { ...bundle, log: wrongContractLog, receipt: { ...bundle.receipt!, logs: [wrongContractLog] } };
  expectCode(() => new CapitalCommittedAdapter(manifest).adapt(wrongContract), "INVALID_SOURCE_EVENT");

  const wrongToken = makeEvent({ token: "0x000000000000000000000000000000000000d099" });
  expectCode(() => new CapitalCommittedAdapter(manifest).adapt({ ...bundle, log: wrongToken.log, receipt: wrongToken.receipt, block: wrongToken.block }), "INVALID_SOURCE_EVENT");

  const wrongSelectorLog = { ...bundle.log!, topics: ["0x" + "11".repeat(32), ...bundle.log!.topics.slice(1)] };
  const wrongSelector = { ...bundle, log: wrongSelectorLog, receipt: { ...bundle.receipt!, logs: [wrongSelectorLog] } };
  expectCode(() => new CapitalCommittedAdapter(manifest).adapt(wrongSelector), "INVALID_SOURCE_EVENT");
});

test("adapter rejects malformed topic/data and receipt/log inconsistency", async () => {
  const bundle = await validBundle();
  const malformedTopicsLog = { ...bundle.log!, topics: bundle.log!.topics.slice(0, 3) };
  const malformedTopics = { ...bundle, log: malformedTopicsLog, receipt: { ...bundle.receipt!, logs: [malformedTopicsLog] } };
  expectCode(() => new CapitalCommittedAdapter(manifest).adapt(malformedTopics), "INVALID_SOURCE_EVENT");

  const malformedDataLog = { ...bundle.log!, data: "0x1234" };
  const malformedData = { ...bundle, log: malformedDataLog, receipt: { ...bundle.receipt!, logs: [malformedDataLog] } };
  expectCode(() => new CapitalCommittedAdapter(manifest).adapt(malformedData), "INVALID_SOURCE_EVENT");

  const receiptMismatch = { ...bundle, receipt: { ...bundle.receipt!, blockHash: "0x" + "cc".repeat(32) } };
  expectCode(() => new CapitalCommittedAdapter(manifest).adapt(receiptMismatch), "INCONSISTENT_SOURCE_DATA");

  const transactionMismatch = { ...bundle, receipt: { ...bundle.receipt!, transactionHash: "0x" + "dd".repeat(32) } };
  expectCode(() => new CapitalCommittedAdapter(manifest).adapt(transactionMismatch), "INCONSISTENT_SOURCE_DATA");

  const failedReceipt = { ...bundle, receipt: { ...bundle.receipt!, status: 0 as const } };
  expectCode(() => new CapitalCommittedAdapter(manifest).adapt(failedReceipt), "INVALID_SOURCE_EVENT");
});

test("adapter rejects malformed hashes, addresses, bytes32, and unsafe numeric values", async () => {
  const bundle = await validBundle();
  expectCode(() => new CapitalCommittedAdapter(manifest).adapt({ ...bundle, block: { ...bundle.block!, blockHash: "0x1234" } }), "MALFORMED_PROVIDER_RESPONSE");
  expectCode(() => new CapitalCommittedAdapter(manifest).adapt({ ...bundle, log: { ...bundle.log!, transactionHash: "0x1234" } }), "MALFORMED_PROVIDER_RESPONSE");

  const badTopicLog = { ...bundle.log!, topics: [bundle.log!.topics[0]!, "0x1234", ...bundle.log!.topics.slice(2)] };
  const badTopic = { ...bundle, log: badTopicLog, receipt: { ...bundle.receipt!, logs: [badTopicLog] } };
  expectCode(() => new CapitalCommittedAdapter(manifest).adapt(badTopic), "MALFORMED_PROVIDER_RESPONSE");

  const fractionalBlock = { ...bundle, block: { ...bundle.block!, blockNumber: 10.5 } };
  expectCode(() => new CapitalCommittedAdapter(manifest).adapt(fractionalBlock), "MALFORMED_PROVIDER_RESPONSE");
});

test("adapter rejects invalid amount, expiry, incomplete mapping, and ambiguous mapping", async () => {
  const bundle = await validBundle();
  const zeroAmount = makeEvent({ amount: 0n });
  expectCode(() => new CapitalCommittedAdapter(manifest).adapt({ ...bundle, log: zeroAmount.log, receipt: zeroAmount.receipt, block: zeroAmount.block }), "INVALID_SOURCE_EVENT");

  const expired = makeEvent({ expiresAt: 1n });
  expectCode(() => new CapitalCommittedAdapter(manifest).adapt({ ...bundle, log: expired.log, receipt: expired.receipt, block: expired.block }), "INVALID_SOURCE_EVENT");

  const missing = manifestCopy();
  (missing as unknown as { relationshipMappings: unknown[] }).relationshipMappings = [];
  expectCode(() => new CapitalCommittedAdapter(missing).adapt(bundle), "UNSUPPORTED_SCOPE");

  const ambiguous = manifestCopy();
  (ambiguous as unknown as { relationshipMappings: unknown[] }).relationshipMappings = [...ambiguous.relationshipMappings, ambiguous.relationshipMappings[0]];
  expectCode(() => new CapitalCommittedAdapter(ambiguous).adapt(bundle), "UNSUPPORTED_SCOPE");
});

test("adapter fails closed for fixture/live confusion and unsafe provider objects", async () => {
  const liveWithoutDeployment = manifestCopy();
  (liveWithoutDeployment as { mode: string }).mode = "LIVE_READ";
  expectCode(() => new CapitalCommittedAdapter(liveWithoutDeployment), "UNSUPPORTED_SCOPE");

  const bundle = await validBundle();
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  expectCode(() => new CapitalCommittedAdapter(manifest).adapt({ ...bundle, block: cyclic }), "UNSAFE_INPUT");

  const proxied = new Proxy({}, { getPrototypeOf: () => { throw new Error("proxy trap"); } });
  expectCode(() => new CapitalCommittedAdapter(manifest).adapt({ ...bundle, receipt: proxied }), "UNSAFE_INPUT");
  expectCode(() => new CapitalCommittedAdapter(manifest).adapt({ ...bundle, parent: 1 }), "UNSAFE_INPUT");
});

test("adapter rejects hidden, symbol, sparse, extended, and custom-array provider shapes", async () => {
  const base = await validBundle();
  const hidden = { ...base.log! } as Record<string, unknown>;
  Object.defineProperty(hidden, "hidden", { value: "poison", enumerable: false });
  expectCode(() => new CapitalCommittedAdapter(manifest).adapt({ ...base, log: hidden }), "UNSAFE_INPUT");

  const hiddenTarget = { ...base.log! } as Record<string, unknown>;
  Object.defineProperty(hiddenTarget, "hidden", { value: "poison", enumerable: false, configurable: true });
  const hidingProxy = new Proxy(hiddenTarget, {
    ownKeys: (target) => Reflect.ownKeys(target).filter((key) => key !== "hidden"),
    getOwnPropertyDescriptor: (target, key) => key === "hidden" ? undefined : Reflect.getOwnPropertyDescriptor(target, key),
  });
  expectCode(() => new CapitalCommittedAdapter(manifest).adapt({ ...base, log: hidingProxy }), "UNSAFE_INPUT");

  const symbol = { ...base.log! } as Record<string | symbol, unknown>;
  Object.defineProperty(symbol, Symbol("poison"), { value: "poison", enumerable: true });
  expectCode(() => new CapitalCommittedAdapter(manifest).adapt({ ...base, log: symbol }), "UNSAFE_INPUT");

  const extendedTopics = [...base.log!.topics] as string[] & { extra?: string };
  extendedTopics.extra = "poison";
  expectCode(() => new CapitalCommittedAdapter(manifest).adapt({ ...base, log: { ...base.log!, topics: extendedTopics } }), "UNSAFE_INPUT");

  const sparseTopics = [...base.log!.topics] as string[];
  delete sparseTopics[1];
  expectCode(() => new CapitalCommittedAdapter(manifest).adapt({ ...base, log: { ...base.log!, topics: sparseTopics } }), "UNSAFE_INPUT");

  const customTopics = [...base.log!.topics] as string[];
  Object.setPrototypeOf(customTopics, null);
  expectCode(() => new CapitalCommittedAdapter(manifest).adapt({ ...base, log: { ...base.log!, topics: customTopics } }), "UNSAFE_INPUT");
});

test("adapter rejects duplicate log identities in one receipt", async () => {
  const bundle = await validBundle();
  const duplicate = { ...bundle, receipt: { ...bundle.receipt!, logs: [bundle.log!, { ...bundle.log!, data: bundle.log!.data }] } };
  expectCode(() => new CapitalCommittedAdapter(manifest).adapt(duplicate), "INCONSISTENT_SOURCE_DATA");
});
