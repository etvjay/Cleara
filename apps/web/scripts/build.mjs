import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await new Promise((resolvePromise, reject) => {
  const child = spawn("tsc", ["--project", resolve(root, "tsconfig.json"), "--outDir", dist], { cwd: root, stdio: "inherit" });
  child.on("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`tsc exited ${code}`)));
});
await build({
  entryPoints: [resolve(root, "src/browser.ts")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outdir: resolve(dist, "src"),
  entryNames: "browser",
  chunkNames: "chunks/[name]-[hash]",
  assetNames: "assets/[name]-[hash]",
  splitting: true,
  loader: { ".css": "css" },
});
await cp(resolve(root, "public/index.html"), resolve(dist, "index.html"));
await cp(resolve(root, "public/styles.css"), resolve(dist, "styles.css"));
await cp(resolve(root, "public/assets"), resolve(dist, "assets"), { recursive: true });
await cp(resolve(root, "public/try"), resolve(dist, "try"), { recursive: true });
const tryIndex = resolve(dist, "try/index.html");
for (const route of ["replay", "live", "solo", "claim", "multi-party/new"]) {
  const routeDirectory = resolve(dist, "try", route);
  await mkdir(routeDirectory, { recursive: true });
  await cp(tryIndex, resolve(routeDirectory, "index.html"));
}
console.log(`built ${dist}`);
