# Slice C parallel handoff

Status: `LOCAL_CANDIDATES_UNMERGED`

Slice C was developed in isolated worktrees from the frozen Slice B checkpoint:

```text
Slice B contract checkpoint: 37072a72a361ab4f8ce2ca890135d104d5bd7dc7
Contract: slice-b-read-model-contract-v1
```

These candidates do not prove Slice B correctness and are not merged into `verification/slice-b`.

## Durable snapshot storage candidate

```text
Branch: verification/slice-c-durable-storage
Worktree: /home/ubuntu/cleara-slice-c-durable-storage
Commit: 498e90228a6e5135061bef1997380af25b949414
Files:
  workers/slice-c/durable-storage/src/index.ts
  workers/slice-c/durable-storage/test/durable-storage.test.ts
```

Observed parent-side verification:

```text
Direct tsx test: PASS, 3 tests
Direct TypeScript compilation with repository Node types: PASS
```

The lane persists only serialized Slice B snapshot bodies and hashes. It covers atomic checkpoint writes, restart recovery, stale predecessor rejection, duplicate checkpoint handling, corruption/known-bigint rejection, and scope isolation. It does not provide a production database, hosted persistence, provider backfill, or live indexer.

## Retry/backoff orchestration candidate

```text
Branch: verification/slice-c-retry-orchestration
Worktree: /tmp/cleara-slice-c-retry-orchestration
Commit: 36d8e76cbd73ed9d8d41905230f5db4b0790e1f8
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
Direct tsx test: PASS, 6 tests
Direct TypeScript compilation with repository Node types: PASS
```

The lane consumes serialized contract records only. It covers deterministic delivery identity, duplicate and conflicting delivery handling, source-order processing, bounded retry/backoff, provider-outage dead-lettering, replay-required handoff, and relationship scope isolation. It does not write chains, sign, settle, authorize, or promote Slice B status axes.

## Compatibility gate

Both candidates are descendants of the frozen checkpoint and change only isolated `workers/slice-c/**` paths. Parent-side scans found no protected-path changes, Slice B core imports, secret-like values, wallets, RPC writes, deployments, or live workflow dispatches.

Before any future merge, rerun the compatibility fixture and full Slice B matrix against the combined tree. A candidate may not reinterpret `ACCEPTED`, `CANONICAL`, `FINALIZED`, `REORGED`, `STALE`, `MISMATCHED`, `REPLAY_REQUIRED`, or `RECONCILED`, and no candidate may be used as evidence for production durability or live provider readiness.
