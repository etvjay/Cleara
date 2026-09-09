# Cleara State and Authority

Status: `PROPOSED / HYPOTHESIS`

## State machine

```text
OBSERVED
  -> FINALIZED
  -> PROVEN
  -> CANONICAL
  -> RECONCILED
  -> SETTLED

OBSERVED -> PENDING_SOURCE -> FINALIZED
FINALIZED -> PENDING_PROOF -> PROVEN
any provisional state -> STALE
any source observation -> REORG_DETECTED
any validation path -> REJECTED
CANONICAL -> ACTIVE / COMMITTED / CONSUMED / EXPIRED / CANCELLED
FINALIZED obligations -> clearing -> ROUTED -> SETTLEMENT_PENDING -> SETTLED
```

`ROUTED`, `SETTLEMENT_PENDING`, and `SETTLED` are distinct. `SETTLED` is never derived from route existence alone.

## Authority matrix

| Action | Authority | Required evidence | Projection role |
|---|---|---|---|
| Create source claim | Source wallet / source contract | Native source event | Observe only |
| Prove source inclusion | Attestcoin verifier/evidence path | Source receipt and proof coordinates | Display only |
| Validate claim meaning | Creditcoin gateway/registry authority | Accepted proof and semantic fields | Display only |
| Create/encumber facility | Creditcoin role and facility contracts | Claim/financeability/authority checks | Display only |
| Allocate provider capital | Creditcoin facility/allocation authority | Facility and allocation constraints | Display only |
| Commit source capital | Source wallet/commitment vault | Native receipt and commitment fields | Observe only |
| Capitalize facility | Creditcoin capitalization authority | Provider membership/root/horizon checks | Display only |
| Finalize obligation | Creditcoin obligation authority | Capitalized facility and policy | Display only |
| Authorize bilateral clearing | Authorized clearing counterparties/role | Finalized reciprocal obligations and policy | Display only |
| Derive residual | Creditcoin residual ledger | Finalized clearing result | Display only |
| Route residual | Settlement router authority | Canonical residual and adapter registration | Display only |
| Execute native settlement | Source wallet/settlement adapter | Authorized route and source asset | Observe receipt only |
| Accept/consume proof | Creditcoin settlement/evidence authority | Exact source receipt and Attestcoin proof | Display only |
| Reconcile settlement | Creditcoin settlement reconciler | Exact party/token/domain/amount and evidence | Display only |
| Investigate failure | Operator | Read access to evidence and projections | May classify/replay, never settle |
| Audit | Auditor | Evidence and canonical reads | May attest review, never mutate authority |

## Non-authority rules

- A database, read model, UI, worker, operator, auditor, or agent cannot turn observation into canonical financial state.
- Attestcoin proves source inclusion/continuity; it does not authorize a financial transition.
- A route instruction is not a settlement receipt.
- A source balance is not committed capital.
- An agent/integration may prepare or observe bounded operations only if a separately authorized contract role permits it.

## Race, replay, and recovery

- Canonical contracts reject duplicate clearing, routing, evidence consumption, and reconciliation.
- Workers must use stable event/log identity and finality-aware replay.
- Reorg detection invalidates provisional source observations.
- Mismatches freeze downstream progression until the authoritative parties reconcile them.
- Recovery changes the source/canonical record through its proper authority; operators cannot patch the projection into success.
