# Slice C integration verification

Status: `VERIFIED_REMOTE_CANDIDATE`

Integration branch: `verification/slice-c-integration`
Final integration tree: `41d0d09f860c51586b1e2757be2933eac46fd1f8`
Draft PR: [#3](https://github.com/etvjay/Cleara/pull/3), open and unmerged
Starting Slice B tree: `6f05b10e5e016b5f8fdbbfd0bd7ce3a12ba6fc7e`
Frozen Slice B contract checkpoint: `37072a72a361ab4f8ce2ca890135d104d5bd7dc7`
Contract version: `slice-b-read-model-contract-v1`

## Integrated surfaces

- `workers/slice-c/durable-storage/` persists only serialized Slice B snapshots and deterministic hashes.
- `workers/slice-c/retry-orchestration/` schedules bounded read-only deliveries and preserves typed dead letters/handoffs.
- `workers/slice-c/integration/src/coordinator.ts` is the read-only integration boundary.
- The coordinator calls Slice B's exported `restoreSnapshot` boundary before persistence, restart exposure, or retry submission.
- The coordinator exposes no Slice B maps and creates no accepted, canonical, reconciled, or financial record.

## Assertion-backed combined path

`workers/slice-c/integration/test/coordinator.test.ts` covers:

1. Valid finalized source observation → serialized Slice B snapshot.
2. Strict restore → atomic durable checkpoint.
3. Process restart → public read-model hash and scope readback.
4. Retry delivery → deterministic transient outage/backoff → restart between attempts → success.
5. Updated validated read model → sequence-2 persisted checkpoint → public readback.
6. Duplicate and conflicting deliveries → idempotent duplicate/conflict dead letter.
7. Semantic scope rejection → no queued retry job.
8. Reorg/missing-history state → `REPLAY_REQUIRED` persistence and explicit retry handoff.
9. Retry dead letter → restart preserves terminal state → only explicit operator replay requeues.
10. Corrupt persisted bytes → fail-closed restart rejection.

All providers are deterministic offline doubles. No chain, proof, financial, or hosted operation is performed.

## Local commands

```bash
corepack pnpm install --frozen-lockfile
pnpm exec tsc --noEmit -p workers/slice-c/integration/tsconfig.json
pnpm exec tsx --test workers/slice-c/durable-storage/test/*.test.ts
pnpm exec tsx --test workers/slice-c/retry-orchestration/test/*.test.ts
pnpm exec tsx --test workers/slice-c/integration/test/*.test.ts
node --import tsx --test workers/multichain-execution/test/slice-b-compatibility.test.ts
corepack pnpm check:projection
corepack pnpm web:check
forge fmt --check
forge build --sizes
forge test -vvv
git diff --check
```

The dedicated workflow is `.github/workflows/slice-c-integration.yml`. It is read-only, uses frozen dependencies, and performs no secret access or live dispatch.

Final exact-head workflow readbacks:

- push run [34722839926](https://github.com/etvjay/Cleara/actions/runs/34722839926): `success`, `headSha=41d0d09f860c51586b1e2757be2933eac46fd1f8`;
- pull-request run [34722841590](https://github.com/etvjay/Cleara/actions/runs/34722841590): `success`, `headSha=41d0d09f860c51586b1e2757be2933eac46fd1f8`.

## Evidence ceiling

This is `VERIFIED_REMOTE_CANDIDATE` for the exact integration branch/PR checks, with `VERIFIED_LOCAL` implementation evidence below. It does not prove:

- production filesystem/database durability;
- hosted queue or worker durability;
- production indexing or backfill;
- live provider or Attestcoin behavior;
- Creditcoin writes or settlement execution;
- custody, compliance, ERP/GL, mainnet, or hosted deployment.

Slice B remains the read-only projection boundary. `REPLAY_REQUIRED` remains a recovery state. Operator replay is explicit local orchestration and cannot promote a projection to canonical state.
