import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSliceBApi } from "../../../multichain-execution/src/api.js";
import { createSliceBState } from "../../../multichain-execution/src/slice-b.js";
import {
  DurableSnapshotStore,
  SnapshotStoreError,
  snapshotHashForBody,
} from "../src/index.js";

function serializedFixture() {
  return createSliceBApi(createSliceBState()).serializeSnapshot();
}

function sortedJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, sortedJson(item)]));
  }
  return value;
}

test("checkpoint persists a serialized snapshot and a restarted store recovers it", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-slice-c-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  const snapshot = serializedFixture();
  const firstStore = new DurableSnapshotStore(root);
  const saved = await firstStore.checkpoint("relationship:r1", snapshot);

  assert.equal(saved.status, "STORED");
  assert.equal(saved.record.sequence, 1);
  assert.deepEqual(saved.record.snapshot, snapshot);

  const restartedStore = new DurableSnapshotStore(root);
  assert.deepEqual(await restartedStore.recover("relationship:r1"), saved.record);
});

async function checkpointPath(root: string): Promise<string> {
  const scopes = await readdir(join(root, "scopes"), { withFileTypes: true });
  assert.equal(scopes.length, 1);
  return join(root, "scopes", scopes[0]!.name, "checkpoint.json");
}

test("a duplicate checkpoint still honors an explicitly supplied predecessor expectation", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-slice-c-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  const store = new DurableSnapshotStore(root);
  const snapshot = serializedFixture();
  await store.checkpoint("relationship:r1", snapshot);

  await assert.rejects(
    () => store.checkpoint("relationship:r1", snapshot, { expectedPreviousHash: "0".repeat(64) }),
    (error: unknown) => error instanceof SnapshotStoreError && error.code === "STALE_CHECKPOINT",
  );
});

test("a duplicate checkpoint with an explicit different sequence is rejected", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-slice-c-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  const store = new DurableSnapshotStore(root);
  const snapshot = serializedFixture();
  await store.checkpoint("relationship:r1", snapshot, { sequence: 1 });

  await assert.rejects(
    () => store.checkpoint("relationship:r1", snapshot, { sequence: 2 }),
    (error: unknown) => error instanceof SnapshotStoreError && error.code === "NON_MONOTONIC_CHECKPOINT",
  );
});

test("checkpoint scopes remain isolated across restart", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-slice-c-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  const store = new DurableSnapshotStore(root);
  const snapshot = serializedFixture();
  const secondBodyValue = { ...(JSON.parse(snapshot.body) as Record<string, unknown>), scopeMarker: "other" };
  const secondBody = JSON.stringify(sortedJson(secondBodyValue));
  const otherSnapshot = { hash: snapshotHashForBody(secondBody), body: secondBody };
  await store.checkpoint("relationship:r1", snapshot);
  await store.checkpoint("relationship:r2", otherSnapshot);

  const restarted = new DurableSnapshotStore(root);
  assert.deepEqual((await restarted.recover("relationship:r1"))?.snapshot, snapshot);
  assert.deepEqual((await restarted.recover("relationship:r2"))?.snapshot, otherSnapshot);
});

test("restart rejects a rehashed snapshot with an invalid known bigint", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cleara-slice-c-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  const store = new DurableSnapshotStore(root);
  const snapshot = serializedFixture();
  await store.checkpoint("relationship:r1", snapshot);
  const path = await checkpointPath(root);
  const record = JSON.parse(await readFile(path, "utf8")) as {
    snapshot: { hash: string; body: string };
  };
  const body = record.snapshot.body.replace('"lastObservedBlock":"9n"', '"lastObservedBlock":"9x"');
  assert.notEqual(body, record.snapshot.body);
  record.snapshot = { body, hash: snapshotHashForBody(body) };
  await writeFile(path, JSON.stringify(record), "utf8");

  await assert.rejects(
    () => store.recover("relationship:r1"),
    (error: unknown) => error instanceof SnapshotStoreError && error.code === "CORRUPT_RECORD",
  );
});
