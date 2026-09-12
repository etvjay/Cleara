import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  ProviderOutageSimulator,
  RetryOrchestrator,
  type ReadOnlyProvider,
  type RetryRequest,
  type SerializedSliceBContract,
} from "../src/index.js";

function contract(bodyValue: Record<string, unknown>): SerializedSliceBContract {
  const body = JSON.stringify(bodyValue);
  const hash = createHash("sha256").update(`${body.length}:${body}`, "utf8").digest("hex");
  return { hash, body };
}

function observation(
  id: string,
  relationshipId: string,
  blockNumber: number,
  eventIndex = 0,
  finalityState = "FINALIZED",
): Record<string, unknown> {
  return {
    observationId: id,
    relationshipId,
    chainKey: 1,
    blockNumber: `${blockNumber}n`,
    eventIndex,
    observationState: "OBSERVED",
    finalityState,
    evidenceId: null,
  };
}

function readModel(overrides: Record<string, unknown> = {}): SerializedSliceBContract {
  return contract({
    schemaVersion: "slice-b-read-model-v1",
    observations: [],
    evidence: [],
    canonical: [],
    reconciliations: [],
    checkpoints: [],
    deadLetters: [],
    replayHistory: [],
    ...overrides,
  });
}

function observationContract(): SerializedSliceBContract {
  return readModel({
    observations: [["observation:a", observation("observation:a", "relationship:a", 10)]],
  });
}

function request(contractValue: SerializedSliceBContract, deliveryId: string): RetryRequest {
  return {
    deliveryId,
    contract: contractValue,
    selector: { kind: "observation", id: "observation:a" },
    relationshipId: "relationship:a",
    provider: "attestcoin-read",
    operation: "provider-read",
  };
}

test("serialized Slice B delivery has deterministic identity and duplicate idempotency", () => {
  const serialized = observationContract();
  const orchestrator = new RetryOrchestrator();

  const first = orchestrator.submit(request(serialized, "delivery:first"));
  const duplicate = orchestrator.submit(request(serialized, "delivery:duplicate"));
  const sameDelivery = orchestrator.submit(request(serialized, "delivery:first"));

  assert.equal(first.disposition, "ACCEPTED");
  assert.equal(duplicate.disposition, "DUPLICATE");
  assert.equal(sameDelivery.disposition, "DUPLICATE");
  assert.ok(first.job);
  assert.ok(duplicate.job);
  assert.equal(first.job.id, duplicate.job.id);
  assert.equal(orchestrator.snapshot().jobs.length, 1);
  assert.equal(orchestrator.snapshot().jobs[0]?.source.status.finalityState, "FINALIZED");
  assert.equal(orchestrator.snapshot().jobs[0]?.source.relationshipId, "relationship:a");
});

test("queued deliveries execute in source order even when delivered out of order", () => {
  const serialized = readModel({
    observations: [
      ["observation:late", observation("observation:late", "relationship:a", 11)],
      ["observation:early", observation("observation:early", "relationship:a", 10)],
    ],
  });
  const orchestrator = new RetryOrchestrator();
  const lateRequest = { ...request(serialized, "delivery:late"), selector: { kind: "observation" as const, id: "observation:late" } };
  const earlyRequest = { ...request(serialized, "delivery:early"), selector: { kind: "observation" as const, id: "observation:early" } };
  assert.equal(orchestrator.submit(lateRequest).disposition, "ACCEPTED");
  assert.equal(orchestrator.submit(earlyRequest).disposition, "ACCEPTED");

  const seen: string[] = [];
  const provider: ReadOnlyProvider = {
    read: (job) => {
      seen.push(job.source.recordId);
      return { outcome: "success", receipt: { mode: "read-only", relationshipId: job.relationshipId } };
    },
  };
  const results = orchestrator.executeReady(provider, 0, 2);

  assert.deepEqual(seen, ["observation:early", "observation:late"]);
  assert.deepEqual(results.map((result) => result.outcome), ["COMPLETED", "COMPLETED"]);
  assert.equal(orchestrator.snapshot().jobs.every((job) => job.status === "COMPLETED"), true);
});

test("retry backoff is bounded and provider outage becomes a dead letter", () => {
  const serialized = observationContract();
  const policy = { maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 20, multiplier: 2 } as const;
  const orchestrator = new RetryOrchestrator();
  const result = orchestrator.submit({ ...request(serialized, "delivery:outage"), policy });
  assert.equal(result.disposition, "ACCEPTED");
  const provider = new ProviderOutageSimulator({ alwaysOutage: true });

  const first = orchestrator.executeNext(provider, 0);
  assert.equal(first.outcome, "RETRY_SCHEDULED");
  assert.equal(first.job?.attempts, 1);
  assert.equal(first.job?.nextAttemptAt, 10);
  assert.equal(orchestrator.executeNext(provider, 9).outcome, "IDLE");

  const second = orchestrator.executeNext(provider, 10);
  assert.equal(second.outcome, "RETRY_SCHEDULED");
  assert.equal(second.job?.attempts, 2);
  assert.equal(second.job?.nextAttemptAt, 30);
  assert.equal(orchestrator.executeNext(provider, 29).outcome, "IDLE");

  const exhausted = orchestrator.executeNext(provider, 30);
  assert.equal(exhausted.outcome, "DEAD_LETTERED");
  assert.equal(exhausted.job?.attempts, 3);
  assert.equal(exhausted.deadLetter?.code, "PROVIDER_OUTAGE_EXHAUSTED");
  assert.equal(exhausted.deadLetter?.attempts, 3);
  assert.equal(orchestrator.executeNext(provider, 31).outcome, "IDLE");
});

test("replay-required handoff preserves the frozen checkpoint meaning", () => {
  const serialized = readModel({
    checkpoints: [[1, {
      chainKey: 1,
      replayStatus: "REPLAY_REQUIRED",
      replaySequence: 7,
      replayReason: "replacement observations required",
      replayRecoveryRole: "projection operator",
      replayNextAction: "submit the next finalized replacement",
      replayFromBlock: "10n",
      replayOldBlockHash: "old-h10",
      replayParentBlockHash: "h9",
      replayTargets: [{
        chainKey: 1,
        blockNumber: "10n",
        oldBlockHash: "old-h10",
        oldParentBlockHash: "h9",
        expectedParentBlockHash: "h9",
      }],
    }]],
  });
  const orchestrator = new RetryOrchestrator();
  const submitted = orchestrator.submit({
    deliveryId: "delivery:replay",
    contract: serialized,
    selector: { kind: "checkpoint", id: "1" },
    relationshipId: null,
    provider: "projection-read",
    operation: "replay-required-handoff",
  });
  assert.equal(submitted.disposition, "ACCEPTED");

  const executed = orchestrator.executeNext(null, 0);

  assert.equal(executed.outcome, "HANDOFF_EMITTED");
  assert.equal(executed.handoff?.status, "REPLAY_REQUIRED");
  assert.equal(executed.handoff?.relationshipId, null);
  assert.equal(executed.handoff?.chainKey, 1);
  assert.equal(executed.handoff?.replayFromBlock, "10n");
  assert.equal(executed.handoff?.replayTargets[0]?.expectedParentBlockHash, "h9");
  assert.equal(executed.handoff?.nextAction, "submit the next finalized replacement");
  assert.equal(executed.job?.source.status.replayStatus, "REPLAY_REQUIRED");
  assert.equal(executed.job?.status, "HANDOFF_EMITTED");
});

test("relationship and global scope never cross the serialized Slice B boundary", () => {
  const serialized = readModel({
    observations: [
      ["observation:a", observation("observation:a", "relationship:a", 10)],
      ["observation:b", observation("observation:b", "relationship:b", 11)],
    ],
    evidence: [["evidence:global", {
      evidenceId: "evidence:global",
      relationshipId: null,
      chainKey: 1,
      blockNumber: "10n",
      eventIndex: 0,
      status: "ACCEPTED",
    }]],
  });
  const orchestrator = new RetryOrchestrator();

  const wrongRelationship = orchestrator.submit({
    ...request(serialized, "delivery:wrong-relationship"),
    selector: { kind: "observation", id: "observation:b" },
  });
  const globalAsRelationship = orchestrator.submit({
    deliveryId: "delivery:global-as-relationship",
    contract: serialized,
    selector: { kind: "evidence", id: "evidence:global" },
    relationshipId: "relationship:a",
    provider: "attestcoin-read",
    operation: "provider-read",
  });

  assert.equal(wrongRelationship.disposition, "REJECTED");
  assert.equal(wrongRelationship.deadLetter?.code, "SCOPE_MISMATCH");
  assert.equal(globalAsRelationship.disposition, "REJECTED");
  assert.equal(globalAsRelationship.deadLetter?.code, "SCOPE_MISMATCH");
  assert.equal(orchestrator.snapshot().jobs.length, 0);
  assert.equal(JSON.stringify(orchestrator.snapshot()).includes("relationship:b"), false);
});

test("serialized Slice B history arrays remain consumable without importing Slice B internals", () => {
  const serialized = readModel({
    deadLetters: [{
      observationId: "observation:dead",
      relationshipId: "relationship:a",
      code: "INVALID_OBSERVATION",
      reason: "fixture",
      recoveryRole: "operator",
      nextAction: "repair",
      kind: "OBSERVATION",
    }],
    replayHistory: [{
      id: "replay:blocked",
      relationshipId: "relationship:a",
      chainKey: 1,
      fromBlock: "10n",
      replacementObservationId: "observation:replacement",
      replacementBlockHash: "replacement-h10",
      status: "BLOCKED",
      reason: "fixture",
    }],
  });
  const orchestrator = new RetryOrchestrator();

  const replay = orchestrator.submit({
    deliveryId: "delivery:history-replay",
    contract: serialized,
    selector: { kind: "replay", id: "replay:blocked" },
    relationshipId: "relationship:a",
    provider: "projection-read",
    operation: "provider-read",
  });
  const deadLetter = orchestrator.submit({
    deliveryId: "delivery:history-dead-letter",
    contract: serialized,
    selector: { kind: "dead-letter", id: "observation:dead" },
    relationshipId: "relationship:a",
    provider: "projection-read",
    operation: "provider-read",
  });

  assert.equal(replay.disposition, "ACCEPTED");
  assert.equal(replay.job?.source.recordKind, "replay");
  assert.equal(deadLetter.disposition, "ACCEPTED");
  assert.equal(deadLetter.job?.source.recordKind, "dead-letter");
});
