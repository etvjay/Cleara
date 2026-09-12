# Cleara architecture

## Core

```text
Source domains execute native actions
        ↓
Attestcoin proves external facts
        ↓
Cleara financial-semantics boundary interprets meaning
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

Nomos is the architectural name for Cleara's financial-semantics and interface boundary. This verification branch does not contain an `@cleara/nomos` package or a Nomos contract. Nomos does not own state or authority separate from Creditcoin.

## Slice B

Slice B is the read-model and evidence infrastructure around that core:

```text
observations
→ finality
→ evidence linkage
→ Creditcoin read reference
→ reconciliation
→ provenance
→ derived relationship projection
→ deterministic snapshot/API
```

The Slice B graph, checkpoint, API, and projection are non-authoritative. They cannot authorize clearing, execute settlement, or promote local state over Creditcoin. The projection keeps current reconciliation state separate from append-only reconciliation history, and its replay checkpoint records the target block identity separately from the latest observed tip. These are local read-model concerns, not authority state.

The graph is intentionally narrow in this slice. It represents a relationship-to-object projection with provenance and validity labels. Supported edge types are `DERIVED_FROM`, `PROVEN_BY`, `SETTLED_BY`, and `RECONCILES`. It does not claim to materialize every facility, allocation, commitment, obligation, clearing, residual, and settlement edge.

## Repository routes

- Canonical contracts: `contracts/creditcoin/`
- Source execution contracts: `contracts/source/`
- Slice B projection/read model: `workers/multichain-execution/src/slice-b.ts`
- Local read-only API: `scripts/slice-b/server.ts`
- Workbench: `apps/web/`
- Historical evidence: `evidence/runtime/`
- Architecture: `docs/architecture/`
- Slice B contract: `docs/development/SLICE_B_SPEC.md`

See `docs/canonical/GROUND_TRUTH.md` for authoritative implementation and evidence status.
