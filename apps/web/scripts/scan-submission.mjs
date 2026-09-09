import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { readdir } from "node:fs/promises";

const root = new URL("../../..", import.meta.url);
const scanRoots = ["apps/web", "docs/submission", "README.md"];
const ignored = new Set(["node_modules", "dist"]);
const patterns = [
  ["private-key-pem", /-----BEGIN [A-Z ]+PRIVATE KEY-----/],
  ["email", /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/],
  ["credential-assignment", /\b(?:api[_-]?key|password|secret)\b\s*[:=]\s*["'][^"']{8,}["']/i],
  ["private-key-value", /\bprivate[_-]?key\b\s*[:=]\s*0x[0-9a-fA-F]{64}/i],
];

async function files(path) {
  const entries = await readdir(new URL(path, root), { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const child = `${path}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await files(child));
    else if (entry.isFile() && [".ts", ".mjs", ".json", ".md", ".html", ".css"].includes(extname(entry.name) || entry.name === "README.md" ? extname(entry.name) || ".md" : "")) result.push(child);
  }
  return result;
}

const targets = [];
for (const path of scanRoots) {
  try {
    const url = new URL(path, root);
    const entries = await readdir(url, { withFileTypes: true });
    if (entries) targets.push(...(entries.length ? await files(path) : [path]));
  } catch {
    targets.push(path);
  }
}
const findings = [];
for (const path of targets) {
  if (path.includes("/test/") || path.endsWith("/scan-submission.mjs")) continue;
  const text = await readFile(new URL(path, root), "utf8");
  for (const [name, pattern] of patterns) if (pattern.test(text)) findings.push(`${name}:${path}`);
}
if (findings.length) {
  console.error(`submission scan failed:\n${findings.join("\n")}`);
  process.exit(1);
}
console.log(`submission scan: PASS (${targets.length} files)`);
