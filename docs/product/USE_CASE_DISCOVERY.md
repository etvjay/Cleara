# Cleara Use-Case Discovery

Status: `DRAFT / PROPOSED` — product decision pending review. This package is discovery output, not canonical protocol truth.

## Product question

Cleara's current protocol is broad enough to describe financing, commitment lifecycle, clearing, settlement, and evidence reconciliation. Those are not one product use case. The decision must select the relationship for which the protocol is necessary and the existing evidence is honest.

## Candidate comparison

Scores use 1–5, where 5 is strongest for the selected product. Complexity and regulatory burden are inverse scores: 5 means easier/lower burden. These are product hypotheses, not measured market research.

| Candidate | Urgency | Economic value | Protocol necessity | Blockchain necessity | Attestcoin necessity | CC3 fit | Evidence coverage | Lower complexity | Lower burden | Failure richness | Demo clarity | Production path | Differentiation | Total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A. Facility financing continuity | 3 | 4 | 4 | 4 | 4 | 5 | 4 | 2 | 2 | 4 | 3 | 4 | 4 | 47 |
| B. Capital provider commitment lifecycle | 3 | 4 | 4 | 4 | 5 | 5 | 4 | 3 | 3 | 5 | 4 | 4 | 4 | 52 |
| C. Clear-before-settlement | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 3 | 3 | 5 | 5 | 5 | 5 | 66 |
| D. Institutional evidence reconciliation | 4 | 3 | 4 | 3 | 5 | 4 | 5 | 4 | 4 | 5 | 4 | 4 | 3 | 52 |
| E. Temporary liquidity participation continuity | 2 | 3 | 2 | 3 | 2 | 2 | 1 | 3 | 2 | 3 | 2 | 2 | 2 | 32 |

## Candidate findings

### A — Facility financing continuity

This is an important upstream relationship: a sponsor needs a financeable claim, bounded encumbrance, facility, provider allocations, source commitments, and capitalization. It fits M3–M8 and explains why the facility exists. It is not the best primary slice because the user outcome is distributed across many preconditions and the strongest current settlement evidence arrives later.

### B — Capital provider commitment lifecycle

This is a credible secondary product: a provider needs to know whether a source-chain commitment was proven, recognized, active, consumed, expired, or disputed. M6, M7, and M11-Lifecycle support the protocol semantics. It is narrower than the full thesis and does not alone explain bilateral clearing.

### C — Clear-before-settlement

This is the strongest primary use case. A facility sponsor and counterparty have finalized reciprocal obligations. They need authorized bilateral clearing to reduce gross movement, derive the economic residual, route only that residual, verify native source-chain settlement, consume proof, and reconcile the canonical Creditcoin state. M8–M11 directly cover the sequence, including the critical distinction between clearing, routing, settlement, proof, and reconciliation.

### D — Institutional evidence reconciliation

This is a necessary operating surface for C, not the economic product by itself. Operators need to investigate pending source finality, pending proof, mismatches, stale projections, and reorgs. It should support the primary user journey and become a separate operator role only after the relationship and authority model are defined.

### E — Temporary liquidity participation continuity

This is not sufficiently evidenced or specified in the current repository. It may become an Arkiv-style extension, but selecting it now would invent a market and a participant workflow not proven by the current contracts or evidence.

## Recommendation

- **Primary:** C — Clear-before-settlement for a finalized facility obligation pair.
- **Secondary:** B — Capital provider commitment lifecycle.
- **Supporting/operator:** D — Evidence reconciliation for the same relationship.
- **Upstream prerequisite:** A — Facility financing continuity, retained as context and future expansion.
- **Rejected for this release:** E — Temporary liquidity participation continuity.

## Core use-case statement

A facility sponsor responsible for two finalized obligations uses Cleara when reciprocal movement is due but should be reduced before any native transfer. Cleara proves the relevant source facts, checks authority and canonical Creditcoin state, authorizes bilateral clearing, derives the residual, routes only that residual, verifies the native receipt, accepts Attestcoin evidence, and reconciles the result. The user receives a defensible, evidence-linked terminal settlement record or an explicit blocked state with a recovery owner.

## Why this is not merely a dashboard

The product decision is about an authorized financial relationship and its state transitions. A database can display records but cannot establish source-chain inclusion, bind proof to a canonical Creditcoin state, enforce clearing authority, or distinguish routed from settled. A bridge moves assets but does not authorize reciprocal clearing or prove the accounting relationship. A custodian controls assets but does not supply this cross-domain evidence and lifecycle boundary. An ERP can record obligations but cannot independently verify native source-chain execution and Attestcoin continuity.

## Open decision

This recommendation should be accepted or rejected by the product owner before further frontend work. Until acceptance, `apps/web` remains a provisional hypothesis.
