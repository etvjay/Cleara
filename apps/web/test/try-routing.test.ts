import assert from "node:assert/strict";
import test from "node:test";
import { tryModeIdForPath, tryPathForMode } from "../src/try-model.js";

test("canonical Try routes map one product path to each mode", () => {
  const routes = {
    replay: "/try/replay",
    live: "/try/live",
    guided: "/try/solo",
    claim: "/try/claim",
    multi: "/try/multi-party/new",
  } as const;
  for (const [mode, route] of Object.entries(routes)) {
    assert.equal(tryPathForMode(mode), route);
    assert.equal(tryModeIdForPath(route), mode);
  }
});

test("Try lobby is distinct from dedicated mode routes", () => {
  assert.equal(tryModeIdForPath("/try"), null);
  assert.equal(tryModeIdForPath("/try/"), null);
  assert.equal(tryModeIdForPath("/try/unsupported"), undefined);
});
