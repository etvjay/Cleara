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
await cp(resolve(root, "public/index.html"), resolve(dist, "index.html"));
await cp(resolve(root, "public/styles.css"), resolve(dist, "styles.css"));
await cp(resolve(root, "public/assets"), resolve(dist, "assets"), { recursive: true });
console.log(`built ${dist}`);
