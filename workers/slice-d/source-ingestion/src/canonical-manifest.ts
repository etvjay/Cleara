import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseSourceScopeManifest,
  serializeSourceScopeManifest,
  type SourceScopeManifest,
} from "../../source-scope/src/manifest.js";

export interface CanonicalD0Manifest {
  readonly manifest: SourceScopeManifest;
  readonly hash: string;
  readonly body: string;
}

export function loadCanonicalD0Manifest(): CanonicalD0Manifest {
  const path = join(__dirname, "../../source-scope/manifest.json");
  const manifest = parseSourceScopeManifest(JSON.parse(readFileSync(path, "utf8")));
  const serialized = serializeSourceScopeManifest(manifest);
  return Object.freeze({ manifest, hash: serialized.hash, body: serialized.body });
}
