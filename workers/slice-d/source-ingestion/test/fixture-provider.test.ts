import assert from "node:assert/strict";
import test from "node:test";
import { DeterministicFixtureProvider, SourceProviderError } from "../src/fixture-provider.js";
import { fixtureDataset, manifest, manifestCopy } from "./fixtures.js";

test("fixture provider exposes only deterministic read data and does not retain returned mutations", async () => {
  const provider = new DeterministicFixtureProvider(fixtureDataset());
  const filter = {
    address: manifest.contract.address,
    topic0: manifest.eventFamily.selector,
    fromBlock: 10,
    toBlock: 11,
  };

  const firstLogs = await provider.getLogs(manifest, filter);
  assert.equal(firstLogs.length, 2);
  (firstLogs[0]!.topics as string[])[0] = "0x";
  const secondLogs = await provider.getLogs(manifest, filter);
  assert.equal(secondLogs[0]!.topics[0], manifest.eventFamily.selector);

  const identity = await provider.getChainIdentity(manifest);
  assert.deepEqual(identity, {
    sourceDomain: "ethereum-sepolia",
    chainKey: 1,
    evmChainId: 11155111,
    adapterVersion: "slice-d-source-adapter-v1",
    schemaVersion: "slice-d-source-event-v1",
  });
  assert.equal(await provider.getLatestBlockNumber(manifest), 12);
  assert.equal("sendTransaction" in provider, false);
  assert.equal("signTransaction" in provider, false);
  assert.equal("broadcastTransaction" in provider, false);
});

test("fixture provider binds every read to the exact D0 scope", async () => {
  const provider = new DeterministicFixtureProvider(fixtureDataset());
  const other = manifestCopy();
  (other as { scopeId: string }).scopeId = "source-scope:other";

  await assert.rejects(
    () => provider.getChainIdentity(other),
    (error: unknown) => error instanceof SourceProviderError && error.code === "UNSUPPORTED_SCOPE",
  );
});

test("fixture provider rejects missing reads with typed errors", async () => {
  const provider = new DeterministicFixtureProvider(fixtureDataset());

  await assert.rejects(
    () => provider.getBlockHeader(manifest, 99),
    (error: unknown) => error instanceof SourceProviderError && error.code === "NOT_FOUND",
  );
  await assert.rejects(
    () => provider.getTransactionReceipt(manifest, "0x" + "ff".repeat(32)),
    (error: unknown) => error instanceof SourceProviderError && error.code === "NOT_FOUND",
  );
});

test("fixture provider failures are bounded and recoverable", async () => {
  const provider = new DeterministicFixtureProvider(fixtureDataset(), {
    failures: [{ method: "getLogs", code: "OUTAGE", reason: "offline outage", remaining: 1 }],
  });
  const filter = { address: manifest.contract.address, topic0: manifest.eventFamily.selector, fromBlock: 10, toBlock: 10 };

  await assert.rejects(
    () => provider.getLogs(manifest, filter),
    (error: unknown) => error instanceof SourceProviderError && error.code === "OUTAGE",
  );
  assert.equal((await provider.getLogs(manifest, filter)).length, 1);
});

test("fixture provider can expose deterministic malformed responses for boundary tests", async () => {
  const provider = new DeterministicFixtureProvider(fixtureDataset(), {
    logsOverride: [null],
  });
  const filter = { address: manifest.contract.address, topic0: manifest.eventFamily.selector, fromBlock: 10, toBlock: 10 };

  assert.deepEqual(await provider.getLogs(manifest, filter), [null]);
});
