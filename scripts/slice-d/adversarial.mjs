import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const testDir = "workers/slice-d/source-ingestion/test";
const testFiles = readdirSync(testDir)
  .filter((name) => name.endsWith(".test.ts"))
  .sort()
  .map((name) => join(testDir, name));
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(pnpm, ["exec", "tsx", "--test", ...testFiles], {
  encoding: "utf8",
  stdio: "inherit",
});
process.exit(result.status ?? 1);
