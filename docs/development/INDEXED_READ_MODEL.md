# Indexed Read-Model Projection Core

Status: `IMPLEMENTED_LOCAL` (no live or testnet evidence claim)

This slice is a read-only projection core for the future Cleara indexer. It
folds observed source-chain and Creditcoin events into a deterministic state
that an API or UI can later read. It is not a worker, a financial authority,
or a replacement for the Creditcoin contracts.

## Boundary

```text
native chain events
        -> IndexedEvent adapter (future)
        -> pure projection fold
        -> deterministic JSON snapshot
        -> future API / UI
```

The projection never signs, submits, verifies, or authorizes a transaction. A
projection status is an observation and can be pending or mismatched; the
canonical financial state remains the Creditcoin contracts and their accepted
evidence.

## Current core

`workers/multichain-execution/src/projector.ts` provides:

* source `CapitalCommitted`, `CapitalConsumed`, and `CapitalExpired` folding;
* Creditcoin commitment, allocation, facility, and evidence event folding;
* source/coordination correlation by `sourceCommitmentId`;
* lifecycle evidence coordinates and consumption status;
* `CONSISTENT`, `PENDING_PROOF`, `PENDING_SOURCE`, and `MISMATCH` states;
* gross/consumed/expired/active facility accounting checks;
* idempotent log identity and block-hash reorg detection; and
* finalized-observation promotion without double application.

`workers/multichain-execution/src/snapshot.ts` serializes `bigint` values as
decimal strings and sorts map entries for deterministic snapshots. It can be
used as a checkpoint format, not as evidence of chain state.

The initial event vocabulary is intentionally bounded to the events emitted by
the M11-Lifecycle contracts and the financing/evidence registries. Unknown
events are ignored by default for forward compatibility; strict ingestion can
reject them at an adapter boundary.

## Verification

The local worker package passes TypeScript strict checking and its projection
tests. No live workflow consumes this package yet. A future production indexer
must add RPC/log backfill, finality policy, durable checkpoints, reorg replay,
and independent operational monitoring before this core can be promoted.

M11-Lifecycle itself now has current-head testnet evidence in workflow run
`33699324988` (artifact `9873864767`). That evidence promotes the lifecycle
contracts, not this read-model core. The projection remains local scaffolding
until a separately defined indexing/backfill gate exists.
