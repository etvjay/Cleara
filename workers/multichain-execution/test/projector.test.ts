import assert from "node:assert/strict";
import test from "node:test";

import {
  applyEvent,
  applyEvents,
  createProjectionState,
  eventId,
  ProjectionError,
} from "../src/projector.js";
import { deserializeProjectionState, serializeProjectionState } from "../src/snapshot.js";
import type { IndexedEvent } from "../src/model.js";

const SOURCE_ID = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const COMMITMENT_ID = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const FACILITY_ID = "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const ALLOCATION_ID = "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
const EVIDENCE_ID = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const DOMAIN_ID = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
const PROVIDER = "0x1111111111111111111111111111111111111111";
const RECIPIENT = "0x2222222222222222222222222222222222222222";
const VAULT = "0x3333333333333333333333333333333333333333";
const TOKEN = "0x4444444444444444444444444444444444444444";

function event(
  name: string,
  args: Record<string, unknown>,
  options: Partial<Pick<IndexedEvent, "chain" | "blockNumber" | "logIndex" | "transactionIndex" | "blockHash" | "transactionHash" | "address" | "domainId" | "finality">> = {},
): IndexedEvent {
  const blockNumber = options.blockNumber ?? 1n;
  const ordinal = Number(blockNumber) + (options.logIndex ?? 0);
  const hex = ordinal.toString(16).padStart(64, "0");
  return {
    chain: options.chain ?? "coordination",
    chainId: options.chain === "source" ? 11155111 : 102031,
    chainKey: options.chain === "source" ? 1 : 0,
    domainId: options.domainId ?? DOMAIN_ID,
    blockNumber,
    blockHash: options.blockHash ?? `0x${hex}`,
    transactionHash: options.transactionHash ?? `0x${(ordinal + 1000).toString(16).padStart(64, "0")}`,
    transactionIndex: options.transactionIndex ?? 0,
    logIndex: options.logIndex ?? 0,
    address: options.address ?? "0x5555555555555555555555555555555555555555",
    name,
    args,
    observedAt: Number(blockNumber),
    finality: options.finality ?? "finalized",
  };
}

function lifecycleFixture(): IndexedEvent[] {
  const sourceCommit = event(
    "CapitalCommitted",
    {
      sourceCommitmentId: SOURCE_ID,
      facilityId: FACILITY_ID,
      allocationId: ALLOCATION_ID,
      provider: PROVIDER,
      assetClassId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa01",
      token: TOKEN,
      amount: 100n,
      expiresAt: 500n,
    },
    { chain: "source", blockNumber: 1n, address: VAULT },
  );
  const registration = event(
    "CommitmentRegistered",
    {
      commitmentId: COMMITMENT_ID,
      facilityId: FACILITY_ID,
      allocationId: ALLOCATION_ID,
      sourceCommitmentId: SOURCE_ID,
      provider: PROVIDER,
      assetClassId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa01",
      token: TOKEN,
      amount: 100n,
      expiresAt: 500n,
      evidenceId: "0x9999999999999999999999999999999999999999999999999999999999999999",
    },
    { blockNumber: 2n },
  );
  const allocation = event(
    "AllocationProposed",
    { allocationId: ALLOCATION_ID, facilityId: FACILITY_ID, provider: PROVIDER, amount: 100n, expiresAt: 500n, nonce: 0n },
    { blockNumber: 3n },
  );
  const allocationCommitted = event(
    "AllocationStatusChanged",
    { allocationId: ALLOCATION_ID, previousStatus: 2, newStatus: 3 },
    { blockNumber: 4n },
  );
  const sourceConsumed = event(
    "CapitalConsumed",
    { sourceCommitmentId: SOURCE_ID, recipient: RECIPIENT, amount: 100n },
    { chain: "source", blockNumber: 5n, address: VAULT },
  );
  const evidence = event(
    "EvidenceRegistered",
    {
      evidenceId: EVIDENCE_ID,
      domainId: DOMAIN_ID,
      chainKey: 1,
      blockHeight: 99n,
      txIndex: 7n,
      eventIndex: 2,
      encodedTransactionHash: "0xabababababababababababababababababababababababababababababababab",
      payloadHash: "0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
      gateway: "0x6666666666666666666666666666666666666666",
    },
    { blockNumber: 6n },
  );
  const commitmentConsumed = event(
    "CommitmentConsumed",
    { commitmentId: COMMITMENT_ID, evidenceId: EVIDENCE_ID, recipient: RECIPIENT, amount: 100n },
    { blockNumber: 6n, blockHash: "0x0000000000000000000000000000000000000000000000000000000000000006", transactionHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa06", logIndex: 1 },
  );
  const allocationConsumed = event(
    "AllocationStatusChanged",
    { allocationId: ALLOCATION_ID, previousStatus: 3, newStatus: 4 },
    { blockNumber: 6n, blockHash: "0x0000000000000000000000000000000000000000000000000000000000000006", transactionHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa06", logIndex: 2 },
  );
  const evidenceConsumed = event(
    "EvidenceConsumed",
    { evidenceId: EVIDENCE_ID, consumer: "0x7777777777777777777777777777777777777777" },
    { blockNumber: 6n, blockHash: "0x0000000000000000000000000000000000000000000000000000000000000006", transactionHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa06", logIndex: 3 },
  );
  const accepted = event(
    "CommitmentLifecycleAccepted",
    { commitmentId: COMMITMENT_ID, evidenceId: EVIDENCE_ID, queryId: "0x1212121212121212121212121212121212121212121212121212121212121212", action: 1, sourceCommitmentId: SOURCE_ID, actor: RECIPIENT, amount: 100n },
    { blockNumber: 6n, blockHash: "0x0000000000000000000000000000000000000000000000000000000000000006", transactionHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa06", logIndex: 4 },
  );
  return [sourceCommit, registration, allocation, allocationCommitted, sourceConsumed, evidence, commitmentConsumed, allocationConsumed, evidenceConsumed, accepted];
}

test("projects a consumed lifecycle with proof coordinates and accounting-safe status", () => {
  const state = applyEvents(createProjectionState(), lifecycleFixture());
  const commitment = state.commitments.get(COMMITMENT_ID);
  assert.ok(commitment);
  assert.equal(commitment.sourceStatus, "CONSUMED");
  assert.equal(commitment.coordinationStatus, "CONSUMED");
  assert.equal(commitment.allocationStatus, "CONSUMED");
  assert.equal(commitment.consistency, "CONSISTENT");
  assert.equal(commitment.lifecycleEvidenceId, EVIDENCE_ID);
  assert.equal(commitment.lifecycleQueryId, "0x1212121212121212121212121212121212121212121212121212121212121212");
  assert.equal(commitment.lifecycleProof?.blockHeight, 99n);
  assert.equal(commitment.lifecycleProof?.txIndex, 7n);
  assert.equal(commitment.lifecycleProof?.eventIndex, 2);
  assert.equal(commitment.lifecycleProof?.evidenceConsumed, true);
  assert.equal(state.evidence.get(EVIDENCE_ID)?.consumed, true);
  assert.equal(state.commitments.size, 1);
});

test("correlates source-first observations and reports pending proof", () => {
  let state = createProjectionState();
  state = applyEvent(state, event("CapitalCommitted", { sourceCommitmentId: SOURCE_ID, amount: 10n }, { chain: "source", address: VAULT }));
  assert.equal(state.commitments.get(SOURCE_ID)?.consistency, "PENDING_PROOF");
  state = applyEvent(state, event("CommitmentRegistered", { commitmentId: COMMITMENT_ID, sourceCommitmentId: SOURCE_ID, amount: 10n }, { blockNumber: 2n }));
  assert.equal(state.commitments.size, 1);
  assert.equal(state.commitments.get(COMMITMENT_ID)?.consistency, "CONSISTENT");
});

test("projects the expiry branch with provider actor and terminal expiry", () => {
  const expiryEvents = [
    event("CapitalCommitted", { sourceCommitmentId: SOURCE_ID, facilityId: FACILITY_ID, allocationId: ALLOCATION_ID, provider: PROVIDER, token: TOKEN, amount: 25n, expiresAt: 20n }, { chain: "source", address: VAULT, blockNumber: 1n }),
    event("CommitmentRegistered", { commitmentId: COMMITMENT_ID, sourceCommitmentId: SOURCE_ID, facilityId: FACILITY_ID, allocationId: ALLOCATION_ID, provider: PROVIDER, token: TOKEN, amount: 25n, expiresAt: 20n }, { blockNumber: 2n }),
    event("CapitalExpired", { sourceCommitmentId: SOURCE_ID, provider: PROVIDER, amount: 25n }, { chain: "source", address: VAULT, blockNumber: 3n }),
    event("EvidenceRegistered", { evidenceId: EVIDENCE_ID, domainId: DOMAIN_ID, chainKey: 1, blockHeight: 30n, txIndex: 1n, eventIndex: 0, encodedTransactionHash: "0xabababababababababababababababababababababababababababababababab", payloadHash: null }, { blockNumber: 4n }),
    event("CommitmentExpired", { commitmentId: COMMITMENT_ID, evidenceId: EVIDENCE_ID, provider: PROVIDER, amount: 25n }, { blockNumber: 4n, blockHash: "0x0000000000000000000000000000000000000000000000000000000000000004", transactionHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa04", logIndex: 1 }),
    event("AllocationStatusChanged", { allocationId: ALLOCATION_ID, previousStatus: 3, newStatus: 5 }, { blockNumber: 4n, blockHash: "0x0000000000000000000000000000000000000000000000000000000000000004", transactionHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa04", logIndex: 2 }),
    event("CommitmentLifecycleAccepted", { commitmentId: COMMITMENT_ID, evidenceId: EVIDENCE_ID, queryId: "0x1212121212121212121212121212121212121212121212121212121212121212", action: 2, sourceCommitmentId: SOURCE_ID, actor: PROVIDER, amount: 25n }, { blockNumber: 4n, blockHash: "0x0000000000000000000000000000000000000000000000000000000000000004", transactionHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa04", logIndex: 3 }),
  ];
  const state = applyEvents(createProjectionState(), expiryEvents);
  const commitment = state.commitments.get(COMMITMENT_ID);
  assert.ok(commitment);
  assert.equal(commitment.sourceStatus, "EXPIRED");
  assert.equal(commitment.coordinationStatus, "EXPIRED");
  assert.equal(commitment.actor, PROVIDER);
  assert.equal(commitment.consistency, "CONSISTENT");
});

test("is idempotent and rejects a block reorg", () => {
  const first = event("CapitalCommitted", { sourceCommitmentId: SOURCE_ID, amount: 10n }, { chain: "source", address: VAULT, blockNumber: 10n });
  let state = applyEvent(createProjectionState(), first);
  const duplicate = { ...first, finality: "finalized" as const };
  state = applyEvent(state, duplicate);
  assert.equal(state.appliedEventIds.size, 1);
  assert.equal(state.commitments.get(SOURCE_ID)?.sourceEvent?.finality, "finalized");
  assert.throws(
    () => applyEvent(state, { ...first, blockHash: `0x${"9".repeat(64)}` }),
    (error: unknown) => error instanceof ProjectionError && error.code === "REORG_DETECTED",
  );
  assert.equal(eventId(first), eventId(duplicate));
});

test("marks terminal disagreement as mismatch and coordination-first state as pending source", () => {
  let state = createProjectionState();
  state = applyEvent(state, event("CommitmentRegistered", { commitmentId: COMMITMENT_ID, sourceCommitmentId: SOURCE_ID, amount: 10n }, { blockNumber: 1n }));
  state = applyEvent(state, event("CommitmentExpired", { commitmentId: COMMITMENT_ID, evidenceId: EVIDENCE_ID, provider: PROVIDER, amount: 10n }, { blockNumber: 2n }));
  assert.equal(state.commitments.get(COMMITMENT_ID)?.consistency, "PENDING_SOURCE");
  state = applyEvent(state, event("CapitalConsumed", { sourceCommitmentId: SOURCE_ID, recipient: RECIPIENT, amount: 10n }, { chain: "source", address: VAULT, blockNumber: 3n }));
  assert.equal(state.commitments.get(COMMITMENT_ID)?.consistency, "MISMATCH");
});

test("maintains gross/terminal/active facility accounting and rejects over-consumption", () => {
  let state = createProjectionState();
  state = applyEvent(state, event("CommittedAmountChanged", { facilityId: FACILITY_ID, previousAmount: 0n, newAmount: 100n }, { blockNumber: 1n }));
  state = applyEvent(state, event("TerminalCommittedAmountChanged", { facilityId: FACILITY_ID, terminalKind: 1, previousAmount: 0n, newAmount: 40n }, { blockNumber: 2n }));
  state = applyEvent(state, event("TerminalCommittedAmountChanged", { facilityId: FACILITY_ID, terminalKind: 2, previousAmount: 0n, newAmount: 60n }, { blockNumber: 3n }));
  const facility = state.facilities.get(FACILITY_ID);
  assert.ok(facility);
  assert.equal(facility.committedAmount, 100n);
  assert.equal(facility.consumedAmount, 40n);
  assert.equal(facility.expiredAmount, 60n);
  assert.equal(facility.activeCommittedAmount, 0n);
  assert.throws(
    () => applyEvent(state, event("TerminalCommittedAmountChanged", { facilityId: FACILITY_ID, terminalKind: 1, previousAmount: 40n, newAmount: 41n }, { blockNumber: 4n })),
    (error: unknown) => error instanceof ProjectionError && error.code === "ACCOUNTING_INVARIANT",
  );
});

test("ignores unknown events by default and supports strict ingestion", () => {
  const unknown = event("FutureEvent", { value: 1n });
  const state = applyEvent(createProjectionState(), unknown);
  assert.equal(state.appliedEventIds.size, 1);
  assert.throws(
    () => applyEvent(createProjectionState(), unknown, { strict: true }),
    (error: unknown) => error instanceof ProjectionError && error.code === "UNKNOWN_EVENT",
  );
});

test("serializes a deterministic snapshot without losing bigint coordinates", () => {
  const state = applyEvents(createProjectionState(), lifecycleFixture());
  const first = serializeProjectionState(state);
  const restored = deserializeProjectionState(first);
  const second = serializeProjectionState(restored);
  assert.equal(second, first);
  assert.equal(restored.commitments.get(COMMITMENT_ID)?.amount, 100n);
  assert.equal(restored.commitments.get(COMMITMENT_ID)?.lifecycleProof?.blockHeight, 99n);
  assert.deepEqual([...restored.appliedEventIds].sort(), [...state.appliedEventIds].sort());
});
