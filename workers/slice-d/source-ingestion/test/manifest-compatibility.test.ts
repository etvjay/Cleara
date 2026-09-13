import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  parseSourceScopeManifest,
  serializeSourceScopeManifest,
} from "../../source-scope/src/manifest.js";
import { DeterministicFixtureProvider } from "../src/fixture-provider.js";
import { manifest, manifestCopy, fixtureDataset } from "./fixtures.js";

test("D1 consumes the exact D0 manifest without changing its canonical hash", () => {
  const raw = JSON.parse(readFileSync("workers/slice-d/source-scope/manifest.json", "utf8"));
  const parsed = parseSourceScopeManifest(raw);
  const serialized = serializeSourceScopeManifest(parsed);
  assert.equal(serialized.hash, "4ea1254bd6b60015cfe79bf3c07aacf45464772e1ca6fb33fdbc78bf4ba7e8b8");
  assert.equal(serialized.body.length, 2667);
  assert.equal(parsed.mode, "FIXTURE_ONLY");
  assert.equal(parsed.liveRead.available, false);
});

test("D1 does not silently promote fixture or unsupported scope data", async () => {
  const fixtureProvider = new DeterministicFixtureProvider(fixtureDataset());
  const other = manifestCopy();
  (other as { scopeId: string }).scopeId = "source-scope:other";
  await assert.rejects(() => fixtureProvider.getLatestBlockNumber(other), { code: "UNSUPPORTED_SCOPE" });

  const live = manifestCopy();
  (live as { mode: string }).mode = "LIVE_READ";
  assert.throws(() => parseSourceScopeManifest(live), { code: "LIVE_CONFIG_MISSING" });
});
