# Slice D1 Source Ingestion Specification

Status: `IMPLEMENTED_LOCAL`

D1 is a bounded, read-only source-ingestion and finality-aware backfill slice. It consumes the D0 source-scope manifest and adapts one deterministic `CapitalCommitted` event into the frozen Slice B read model, then persists the serialized B contract through the Slice C boundary.

D1 is not a production indexer, hosted worker, proof service, settlement engine, custody system, wallet, bridge, or financial authority.

## Source of truth

The sole source-scope configuration is:

```text
workers/slice-d/source-scope/manifest.json
```

D0 manifest binding:

```text
manifestVersion: slice-d-source-scope-v1
scopeId: source-scope:ethereum-sepolia:capital-committed:fixture-v1
sourceDomain: ethereum-sepolia
chainKey: 1
evmChainId: 11155111
mode: FIXTURE_ONLY
live-read: NOT_VERIFIED
manifest SHA-256: 4ea1254bd6b60015cfe79bf3c07aacf45464772e1ca6fb33fdbc78bf4ba7e8b8
```

The checked-in D0 body is loaded and hashed at runtime. `SourceBackfill` and `SliceCSerializedBoundary` reject any same-scope variant whose canonical hash is not the D0 hash above.

The contract and token addresses in the manifest are deterministic fixture identifiers only. They are not current deployments, historical deployment claims, RPC targets, or testnet evidence.

## Event and mapping

D1 consumes the repository-defined event family from the manifest and the `CapitalCommitmentVault` source definition:

```text
CapitalCommitted(
  bytes32 indexed sourceCommitmentId,
  bytes32 indexed facilityId,
  bytes32 indexed allocationId,
  address provider,
  bytes32 assetClassId,
  address token,
  uint256 amount,
  uint64 expiresAt
)
```

The event selector, indexed topic positions, data field types, token address, and token decimals are validated from D0. The adapter round-trips the complete event encoding before accepting it.

The only relationship mapping is:

```text
CapitalCommitted.sourceCommitmentId
-> objectId: sourceCommitmentId
-> relationshipId: relationship:fixture:capital-commitment:{sourceCommitmentId}
-> objectType: Commitment
-> scope: RELATIONSHIP_SCOPED
```

D1 never accepts a caller-supplied relationship ID as authoritative input.

## Provider boundary

`SourceReadProvider` exposes only:

```text
getChainIdentity(scope)
getLatestBlockNumber(scope)
getBlockHeader(scope, blockNumber)
getLogs(scope, filter)
getTransactionReceipt(scope, transactionHash)
```

There are no send, sign, broadcast, wallet, private-key, or write methods. The provider is injected into `SourceBackfill`; the adapter does not construct a global provider.

`DeterministicFixtureProvider` clones fixture data and returned values. It can simulate missing reads, timeout, outage, rate limiting, malformed responses, changed headers, reordered logs, overlapping reads, and replacement blocks.

## Adapter boundary

`CapitalCommittedAdapter` validates:

- exact source domain, chain key, EVM chain ID, adapter version, and event schema;
- exact contract and token identities from D0;
- block number, hash, parent hash, and safe timestamp;
- transaction hash, transaction index, receipt status, and receipt inclusion;
- log index, event index, address, selector, topics, data, block metadata, and transaction metadata;
- all bytes32 fields, addresses, amount, expiry, and token decimals;
- exact event ABI round-trip and payload canonicalization;
- the single D0 relationship mapping.

The normalized observation contains source identity, relationship and object identity, source coordinates, payload hash, finality state, evidence state, reconciliation state, adapter version, and schema version. It is marked `evidenceId: null`, `finalityState: UNKNOWN`, and `evidenceMode: implemented_local`. D1 reports proof as `PENDING_PROOF`; an observation or receipt is not an Attestcoin proof and is not financial authorization.

## Backfill boundary

`SourceBackfill.run` accepts a finite request:

```text
{
  scope,
  startBlock,
  endBlock,
  maxRange?,
  cursor?,
  finalityPolicy?
}
```

The request cursor is a strict optimistic-concurrency guard: it must equal the last cursor in a restored D1 state, and a non-null cursor is rejected when no matching serialized state is loaded. The maximum range remains 1,000 blocks, and the cursor mode remains explicit `SPARSE_EVENT` with unit `BLOCK`. Exact duplicate scans report their no-op events for that run without mutating the serialized D1 state.

D1 processes blocks in ascending order and logs in deterministic transaction-index, log-index, transaction-hash order. It reads headers, trusted parents, sparse logs, and receipts before committing a block. A current-block provider or checkpoint failure leaves the cursor at the last safe block and discards current-block mutations.

Exact source identity duplicates are no-ops. Conflicting identity or payload observations are rejected. Rejected observations are not handed to Slice B and cannot become graph nodes.

## Finality

The D0 fixture policy is:

```text
mode: CONFIRMATION_DEPTH
version: slice-d-fixture-finality-v1
depth: 2
```

The finalized height is `latestBlock - 2`. Finality is advanced only through Slice B. Lower and equal finality inputs cannot regress a prior checkpoint. Events below the finalized height are `FINALIZED`; newer events remain `FINALITY_PENDING`.

## Reorg and replay

D1 does not implement a second replay algorithm. It delegates reorg detection, trusted-header selection, replay target ordering, replacement-parent validation, superseded history, replay investigations, and exact replay no-op behavior to Slice B's exported functions through `SliceBSerializedBoundary`.

The D1 path:

```text
source replacement
-> strict block and parent validation
-> Slice B ingestObservation
-> Slice B advanceFinality
-> Slice B replayReorg when eligible
-> serialized Slice B snapshot
```

A complete finalized replacement can return the checkpoint to `CURRENT`. Missing trusted history or an unfinalized replacement remains `REPLAY_REQUIRED` with the owner, role, reason, target, and next action preserved by Slice B. A completed replay still exposes `REORG_DETECTED` in D1 status markers. Historical observations remain auditable history, and accepted D1 records mirror a superseded observation with `finalityState: REORGED` rather than silently demoting or retaining it as current.

The serialized B boundary also exposes Slice B's existing `backfillReplayHeader` operation for an explicit operator recovery step. D1 does not self-trust a replacement as its own predecessor.

## B and C integration

D1 uses only serialized public boundaries:

```text
fixture header/log/receipt
-> CapitalCommittedAdapter
-> SliceBSerializedBoundary
-> Slice B serialized snapshot
-> SliceCSerializedBoundary
-> DurableSnapshotStore checkpoint
-> Slice C public restore/readback
```

The C wrapper delegates to `SliceCIntegrationCoordinator`, `DurableSnapshotStore`, and `RetryOrchestrator`. D1 never imports or reads Slice B maps.

The retry path is read-only and carries the serialized B contract. Provider outage, deterministic backoff, serialized retry state, dead letter, operator replay, and successful retry are exposed separately. Successful retry does not clear `REPLAY_REQUIRED`.

## Read-only status

D1 exposes status through typed `BackfillResult`, `SourceBackfill.status()`, `SourceBackfill.readApi()`, and public C retry readback. No D1 HTTP route was added, and the existing frontend remains fixture-backed.

Status markers include the applicable subset of:

```text
OBSERVED
FINALITY_PENDING
FINALIZED
PENDING_PROOF
RECONCILIATION_PENDING
REPLAY_REQUIRED
REORG_DETECTED
REJECTED
BLOCKED
```

`RECONCILED`, `MISMATCH`, and `STALE` are not manufactured by D1 because D1 performs no canonical Creditcoin read and no reconciliation authority operation.

## Evidence ceiling

D1 evidence is classified as:

- `IMPLEMENTED_LOCAL`: adapter, backfill, status, and boundary behavior;
- `FIXTURE_ONLY`: deterministic source data and addresses;
- `VERIFIED_LOCAL`: commands executed against the exact local candidate;
- `VERIFIED_REMOTE`: only exact-head CI runs, once read back from GitHub;
- `NOT_VERIFIED`: live provider, current deployment, live RPC read, Attestcoin proof, hosted durability, browser verification, and production readiness.

No D1 output is a live deployment claim, testnet transaction claim, proof claim, settlement claim, or financial authorization.
