import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/slice-d/demo.ts"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}
const report = JSON.parse(result.stdout);
assert.equal(report.mode, "FIXTURE_ONLY");
assert.equal(report.success.accepted, 2);
assert.equal(report.failureRecovery.deadLetter, "DEAD_LETTERED");
assert.equal(report.reorg.replayStatus, "CURRENT");
console.log("Slice D1 smoke: PASS");
