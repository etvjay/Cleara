# Cleara Continuation Checkpoint — 3 September 2026

Status: `SAVED`

This checkpoint preserves the current implementation truth and the proposed
webapp direction before the next build slice. The webapp surface described here
is a proposal; it does not change Cleara's canonical product or evidence status.

## Repository state

```text
Repository: etvjay/Cleara
Checkpoint artifact: docs/development/CHECKPOINT_2026-09-03.md
Webapp surface artifact: docs/development/WEBAPP_SURFACE.md
Code slice under checkpoint: 549d54ed6f3bb733159b9ad9e58068248f8f3ee9
```

The repository currently contains the protocol contracts, live evidence
scripts/workflows, and the local indexed projection core. There is no
`apps/web` frontend implementation yet.

## Protected truth

```text
Cleara is a multichain financing and clearing protocol, not a universal wallet,
bridge, custody layer, or globally atomic settlement system.

Creditcoin is the canonical coordination and financial-state environment.
Attestcoin proves source-chain inclusion/continuity; it does not decide
financial meaning or authorize a transition.
Source-chain actions execute on the source chain.
Settlement reach does not imply verification reach.
chainKey is distinct from the EVM chain ID.
Asset identity is (assetClassId, domainId, token/representationId).
DATABASE / read model != canonical financial state.
```

Participants should experience Cleara as chain-neutral: they work with
relationships, facilities, commitments, obligations, evidence, and actions.
They should not be forced to understand Creditcoin in order to act on a
supported source chain.

## Evidence state at checkpoint

```text
M1: VERIFIED_CLEARA
M2-M11: TESTED_TESTNET
M11-Lifecycle: TESTED_TESTNET
Indexed read-model projection core: IMPLEMENTED_LOCAL
M11 live run: 33614782209 / artifact 9841386218 / PASS
M11-Lifecycle live run: 33699324988 / artifact 9873864767 / PASS
```

M11-Lifecycle evidence reconciled gross `200000`, consumed `100000`, expired
`100000`, active `0`, with lifecycle proofs accepted and consumed. It does not
prove a production indexer, durable workers, production capital, or readiness
for production value.

## Webapp decision carried forward

The participant app is a relationship/obligation workspace. Its primary object
is the financial relationship and its lifecycle; a chain is shown as the
execution, evidence, or coordination context for each step.

```text
source action
    -> source receipt
    -> Attestcoin evidence
    -> Creditcoin canonical transition
    -> residual settlement / reconciliation
```

The complete proposed surface is in
`docs/development/WEBAPP_SURFACE.md`. The first defensible frontend slice is a
fixture-backed, read-only M11/M11-Lifecycle proof workspace plus the connection
and capability model. It is a workbench for concrete cases and state
transitions, not a dashboard. Real write actions should follow the indexer/API
boundary, not be simulated in the UI.

## Review of the DaoTian recommendations

The recommendations are relevant and mostly preserve Cleara's thesis:

```text
indexed read model -> durable evidence workers -> reconciliation/failure
controls -> authority separation -> one real-asset adapter
```

The current projection core already covers the deterministic fold, proof/source
pending states, accounting checks, idempotency, finality promotion, and reorg
detection. The missing operational layer is RPC backfill, durable checkpoints,
replay, monitoring, and an API that exposes provenance and uncertainty.

Two corrections are carried forward:

1. Reconciliation and exception handling are part of the indexer/API product
   boundary, not a later dashboard feature.
2. `CONSUMED`, `RELEASED`, `EXPIRED`, `DISPUTED`, and `SUPERSEDED` should not be
   assumed to form one linear lifecycle. Each needs a defined transition graph,
   authority, reversibility, accounting effect, and race rule before contracts
   change. `DISPUTED` may be an operational overlay rather than a financial
   state.

The strongest customer-facing direction is an institutional state-and-evidence
workbench for credit, treasury, operations, and audit teams. Consumers and
generic wallet users are not Cleara's direct audience.

## Next bounded slice

M12 should implement durable ingestion/backfill for the projection core:

```text
RPC/log backfill
    -> finality-aware checkpoint
    -> reorg detection and replay
    -> deterministic projection
    -> API read model
    -> participant/operator UI
```

Required gates remain idempotency, finality, reorg recovery, source/coordination
correlation, and no mutation of canonical financial state by the indexer.
