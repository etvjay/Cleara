# Cleara architecture

## Core

```text
Source domains execute native actions
        ↓
Attestcoin proves external facts
        ↓
Nomos interprets financial meaning
        ↓
Creditcoin owns canonical financial state
        ↓
Cleara coordinates obligations and authorized clearing
        ↓
Only the economic residual is routed to native settlement
        ↓
Settlement evidence returns through Attestcoin
        ↓
Creditcoin reconciles the relationship
```

## Slice B

Slice B is the read-model and evidence infrastructure around that core:

```text
observations
→ finality
→ evidence linkage
→ Creditcoin read reference
→ reconciliation
→ provenance
→ derived relationship graph
→ deterministic snapshot/API
```

The Slice B graph, checkpoint, API, and projection are non-authoritative. They cannot authorize clearing, execute settlement, or promote local state over Creditcoin.

## Repository routes

- Canonical contracts: `contracts/creditcoin/`
- Source execution contracts: `contracts/source/`
- Nomos semantics: `packages/nomos/`
- Slice B projection/read model: `workers/multichain-execution/src/slice-b.ts`
- Local read-only API: `scripts/slice-b/server.ts`
- Workbench: `apps/web/`
- Historical evidence: `evidence/runtime/`
- Architecture: `docs/architecture/`
- Slice B contract: `docs/development/SLICE_B_SPEC.md`

See `docs/canonical/GROUND_TRUTH.md` for authoritative implementation and evidence status.
