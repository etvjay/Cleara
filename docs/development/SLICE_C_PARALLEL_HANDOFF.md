# Slice C parallel handoff

Status: `VERIFIED_REMOTE_INTEGRATION_UNMERGED`

Slice C integration branch: `verification/slice-c-integration`
Integration base: `6f05b10e5e016b5f8fdbbfd0bd7ce3a12ba6fc7e`
Code-bearing integration commit: `41f3f7ab274b054eed229027ff04543f536c8b3d`
Last receipt tree before repair: `63099bf71552b3db431ade260fd07e9b30c52b9b`
Draft PR: [#3](https://github.com/etvjay/Cleara/pull/3), open and unmerged
Integration checks for that receipt tree: `34722940665` and `34722943715`, both exact-head success
Integration coordinator/spec: `docs/development/SLICE_C_INTEGRATION.md`
Slice C was developed in isolated worktrees from the frozen Slice B checkpoint:

```text
Slice B contract checkpoint: 37072a72a361ab4f8ce2ca890135d104d5bd7dc7
Contract: slice-b-read-model-contract-v1
```

These candidates do not prove Slice B correctness and are not merged into `verification/slice-b`.

## Combined integration candidate

The integrated coordinator is local and unmerged. It validates serialized snapshots through the exported Slice B restore boundary before storage/retry submission, persists per-scope checkpoints, restores retry attempts from a validated retry snapshot, preserves `REPLAY_REQUIRED`, and exposes only read-only coordinator operations. Combined assertions are in `workers/slice-c/integration/test/coordinator.test.ts`; the offline CI job is `.github/workflows/slice-c-integration.yml`.

It does not add production persistence, hosted workers, financial authority, chain writes, proof requests, or settlement execution.

## Durable snapshot storage candidate

```text
Branch: verification/slice-c-durable-storage
Remote ref: refs/heads/verification/slice-c-durable-storage -> e801e549b78e8b62667e6c0dd694a07c07a051df
Worktree: /home/ubuntu/cleara-slice-c-durable-storage
Commit: e801e549b78e8b62667e6c0dd694a07c07a051df
Files:
  workers/slice-c/durable-storage/src/index.ts
  workers/slice-c/durable-storage/test/durable-storage.test.ts
```

Observed parent-side verification:

```text
Direct tsx test: PASS, 5 tests
Direct TypeScript compilation with repository Node types: PASS
```

The lane persists only serialized Slice B snapshot bodies and hashes. It covers atomic checkpoint writes, restart recovery, stale predecessor rejection, duplicate checkpoint handling with explicit sequence consistency, corruption/known-bigint rejection, and scope-isolated restart recovery. It does not provide a production database, hosted persistence, provider backfill, or live indexer.

## Retry/backoff orchestration candidate

```text
Branch: verification/slice-c-retry-orchestration
Remote ref: refs/heads/verification/slice-c-retry-orchestration -> d8389bd3a480f84756132c35933a9598703d860c
Worktree: /tmp/cleara-slice-c-retry-orchestration
Commit: d8389bd3a480f84756132c35933a9598703d860c
Files:
  workers/slice-c/retry-orchestration/src/canonical.ts
  workers/slice-c/retry-orchestration/src/contract.ts
  workers/slice-c/retry-orchestration/src/index.ts
  workers/slice-c/retry-orchestration/src/orchestrator.ts
  workers/slice-c/retry-orchestration/src/types.ts
  workers/slice-c/retry-orchestration/test/orchestrator.test.ts
  workers/slice-c/retry-orchestration/tsconfig.json
```

Observed parent-side verification:

```text
Direct tsx test: PASS, 9 tests
Direct TypeScript compilation with repository Node types: PASS
```

The lane consumes serialized contract records only. It covers deterministic delivery identity, duplicate and conflicting delivery handling, source-order processing, bounded retry/backoff, provider-outage dead-lettering, replay-required handoff, relationship scope isolation, canonical snapshot/known-bigint validation, and malformed delivery dead-lettering. It does not write chains, sign, settle, authorize, or promote Slice B status axes.

## Compatibility gate

Both candidates are descendants of the frozen checkpoint and change only isolated `workers/slice-c/**` paths. Parent-side scans found no protected-path changes, Slice B core imports in production sources, secret-like values, wallets, RPC writes, deployments, or live workflow dispatches. The remote refs confirm publication only; there are no candidate PRs or independent remote review approvals.

Before any future merge, rerun the compatibility fixture and full Slice B matrix against the combined tree. A candidate may not reinterpret `ACCEPTED`, `CANONICAL`, `FINALIZED`, `REORGED`, `STALE`, `MISMATCHED`, `REPLAY_REQUIRED`, or `RECONCILED`, and no candidate may be used as evidence for production durability or live provider readiness.
