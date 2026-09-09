# Cleara User Journeys

Status: `PROPOSED / HYPOTHESIS`

## Journey 1 — Sponsor clears and settles a reciprocal obligation pair

**User:** facility sponsor / treasury operator.

**Relationship:** finalized bilateral obligations associated with one Creditcoin facility.

1. The sponsor opens a specific obligation relationship, not a dashboard.
2. Cleara shows gross obligations of `460000`, the parties, asset/domain, facility, policy, and current authority.
3. The sponsor reviews the clearing authorization and confirms that the reciprocal movement of `120000` is eligible for bilateral clearing.
4. Creditcoin canonical state records the authorized clearing result.
5. Cleara derives the `340000` economic residual. It labels this `ROUTED` only after the route instruction exists.
6. The sponsor sees that routing is not settlement and that no successful receipt has yet been proven.
7. The native settlement adapter executes the residual on the source domain; the source receipt is observed and finalized.
8. Attestcoin evidence proves source inclusion and continuity. Cleara validates payer, recipient, token, domain, and amount.
9. Creditcoin accepts/consumes the required evidence and reconciles the residual.
10. The sponsor receives a settlement record showing debtor `340000 → 0`, creditor `0 → 340000`, residual `340000`, evidence coordinates, and reconciled `SETTLED` state.

**If blocked:** the user receives a precise state such as `PENDING_SOURCE`, `PENDING_PROOF`, `MISMATCH`, `STALE`, or `REORG_DETECTED`, plus authority, blocked reason, recovery owner, and next permitted action.

## Journey 2 — Capital provider checks commitment lifecycle

**User:** capital provider.

1. The provider selects the facility relationship supported by their source commitment.
2. Cleara distinguishes source `CapitalCommitted` from proof-backed recognition and from allocation/capitalization.
3. The provider sees whether the commitment is merely observed, proven, `ACTIVE`, `COMMITTED`, `CONSUMED`, `EXPIRED`, or disputed.
4. The provider sees which facility/allocation the commitment supports and the evidence source for each transition.
5. At terminal lifecycle, the provider receives consumed/expired accounting and evidence, not a generic “complete” badge.

This is secondary because it supports facility continuity but does not alone deliver the primary clear-before-settlement outcome.

## Journey 3 — Operator recovers a broken evidence relationship

**User:** protocol operator or auditor; no financial authority is implied.

1. The operator opens an investigation item linked to the same obligation relationship.
2. The workbench states the observed fact, authoritative source, blocked transition, recovery owner, and next action.
3. For pending source, the operator waits for finality and rereads the receipt.
4. For pending proof, the operator requests or waits for Attestcoin proof.
5. For mismatch, the operator pauses downstream action and compares source receipt, proof coordinates, and canonical Creditcoin state.
6. For stale, the operator refreshes the projection from a trusted checkpoint.
7. For reorg, the operator halts the affected lane and replays from the last finalized checkpoint.
8. The operator cannot mark a financial transition settled; only the protocol's canonical authority path can do so.

## Journey non-goals

- The user does not connect a consumer wallet to browse a portfolio.
- The user does not click a generic “bridge” button.
- The operator does not manually override canonical financial state from the read model.
- The auditor does not treat a screenshot, route instruction, or observed event as settlement proof.
