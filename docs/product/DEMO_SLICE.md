# Cleara Smallest Defensible Demo

Status: `PROPOSED / COMPOSITE_FIXTURE`

## Demo relationship

One facility-linked obligation relationship with reciprocal obligations of `460000`, authorized clearing of `120000`, and residual settlement of `340000`.

The demo is labelled:

```text
COMPOSITE_FIXTURE
```

It combines separately evidenced testnet runs. It is not one uninterrupted live M3→M11 execution.

## Demo path

1. **Starting condition:** facility and obligations are finalized on the Creditcoin side; source commitment and evidence references are available from separate runs.
2. **Role:** facility sponsor/treasury operator.
3. **Trigger:** reciprocal obligations are due and the sponsor needs to reduce gross movement before native settlement.
4. **Source-chain fact:** the residual native settlement receipt is the M11 source fact.
5. **Proof step:** Attestcoin evidence identifies and proves the source receipt.
6. **Creditcoin state:** M9 clearing is authorized, M10 route is recorded, M11 reconciliation is accepted.
7. **Accounting:** `460000 - 120000 = 340000`; debtor `340000 → 0`; creditor `0 → 340000`.
8. **Failure state:** show `PENDING_PROOF`, `MISMATCH`, `STALE`, or `REORG_DETECTED` with authority and recovery action.
9. **Terminal outcome:** `SETTLED` only after receipt, proof, canonical state, and reconciliation all agree.
10. **Evaluator evidence:** workflow run/artifact references, source transaction hash, Attestcoin evidence ID, state badges, accounting fields, and composite-fixture disclaimer.

## Evidence references

- M8: run `33280253700`, artifact `9722789518`.
- M9: run `33280768286`, artifact `9722957475`.
- M10: run `33311029527`, artifact `9731999552`.
- M11: run `33614782209`, artifact `9841386218`.
- M11-Lifecycle: run `33699324988`, artifact `9873864767`.

## What the demo proves

It demonstrates the protocol's state/evidence boundary and the tested obligation-to-settlement semantics in a local composite case.

## What it does not prove

It does not prove production indexing, durable backfill, production settlement, a continuous M3→M11 run, mainnet operation, custody, compliance, or a deployed frontend.
