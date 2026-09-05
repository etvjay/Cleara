# Hackathon Release Checklist

Status: `READY_FOR_HACKATHON_PACKAGING`

This is the stopping line for the current Cleara demonstration. It packages a
credible protocol and evidence story without claiming production readiness.

## Green gates

- [x] M1 verification substrate is recorded as `VERIFIED_CLEARA`.
- [x] M2-M11 protocol slices are recorded as `TESTED_TESTNET`.
- [x] Current-head M11 settlement passed the build/property, live settlement,
      independent payer, proof, replay, and wrong-chain gates (run
      `33614782209`, artifact `9841386218`).
- [x] Current-head M11-Lifecycle passed consume/expire, accounting,
      proof-consumption, replay, and wrong-chain gates (run `33699324988`,
      artifact `9873864767`).
- [x] The local indexed projection is deterministic, idempotent, finality-aware,
      accounting-checked, and reorg-detecting.
- [x] Projection typecheck and tests pass with `pnpm check:projection`.
- [x] README, ground truth, implementation ledger, compliance boundary, SLO
      boundary, and authority matrix agree on the current scope.
- [x] No UI or worker path claims success before evidence and canonical state
      agree.

## Review path

1. Read [`GROUND_TRUTH.md`](../canonical/GROUND_TRUTH.md).
2. Run `pnpm install --frozen-lockfile` and `pnpm check:projection`.
3. Run the GitHub Actions contract workflow for formatting, build, and property
   gates.
4. Inspect the linked M11 and M11-Lifecycle workflow artifacts and their
   independent validators.
5. Treat `IMPLEMENTED_LOCAL`, `TESTED_TESTNET`, and `VERIFIED_CLEARA` as
   different evidence levels.

## Explicitly deferred

These are next-phase engineering, not hidden claims in this release:

- durable RPC/log backfill, checkpoints, and production reorg replay;
- durable evidence workers, dead-letter handling, and operator paging;
- a permissioned API and the proposed workbench frontend;
- complete lifecycle semantics for release, dispute, and supersession;
- production asset adapters, custody, compliance, accounting, privacy, and
  institutional controls; and
- mainnet deployment, production settlement, audit, and real capital.

The stopping line is intentional: the hackathon demonstrates the protocol
semantics and evidence boundary, while the deferred list makes the path to a
real operating system explicit.
