import { createHash } from "node:crypto";

export function canonicalJson(value: unknown, ancestors = new Set<object>()): string {
  return JSON.stringify(canonicalize(value, ancestors));
}

function canonicalize(value: unknown, ancestors: Set<object>): unknown {
  if (value === null || typeof value !== "object") return value;
  if (ancestors.has(value)) throw new Error("CYCLIC_VALUE");
  const nextAncestors = new Set(ancestors).add(value);
  if (Array.isArray(value)) return value.map((item) => canonicalize(item, nextAncestors));
  const record = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonicalize(record[key], nextAncestors)]));
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Slice B hashes a canonical serialized body with a length-prefixed hash input. */
export function serializedSliceBHash(body: string): string {
  return sha256(`${body.length}:${body}`);
}

export function identityHash(value: unknown): string {
  return sha256(canonicalJson(value));
}
