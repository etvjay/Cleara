# Slice D1 Verification

Status at this checkpoint: `REMOTE_CHECKS_PENDING_FOR_FINAL_RECEIPT`.

## Baseline

- Repository: `etvjay/Cleara`
- D0 parent: `8a78ebc33f221cd852d922c9c0df839b49d21950`
- D0 manifest: `workers/slice-d/source-scope/manifest.json`
- D0 manifest SHA-256: `4ea1254bd6b60015cfe79bf3c07aacf45464772e1ca6fb33fdbc78bf4ba7e8b8`
- D0 mode: `FIXTURE_ONLY`
- D0 live-read: `NOT_VERIFIED`
- D1 branch: `verification/slice-d-source-ingestion`
- D1 implementation SHA: `8d2e839b3bd81ba9be865e164ce1a69a76a64cb5`
- D1 earlier implementation checkpoint: `6bbd782aa8d75e8500675d4d034134fe67bda879`
- D1 prior exact-head remote tree: `41a5856f53944e67b9852ea5cbc15f9c83d363f5`
- D1 final receipt tree SHA: recorded by the final branch/PR API readback, not self-referenced in this file
- D1 PR: [#5](https://github.com/etvjay/Cleara/pull/5), open/draft/unmerged

## Focused D1 commands

Executed against the D1 worktree:

```text
corepack pnpm install --frozen-lockfile                         PASS
pnpm exec tsc --noEmit -p workers/slice-d/source-ingestion/tsconfig.json --typeRoots workers/multichain-execution/node_modules/@types  PASS
pnpm exec tsx --test workers/slice-d/source-ingestion/test/*.test.ts  PASS, 38 tests
pnpm exec tsx scripts/slice-d/demo.ts                          PASS
node scripts/slice-d/smoke.mjs                                PASS
node scripts/slice-d/adversarial.mjs                           PASS, 38 tests
```

The D1 tests cover provider identity and isolation, ABI/log/receipt validation, mapping, unsafe values, bounded ranges, sparse cursor behavior, overlap idempotence, finality monotonicity, missing history, conflicting identity, multiple replacement events, retry/backoff, dead letter, operator replay, serialized restart, and read-only status.

## Full local matrix

The final local matrix observed before the pre-receipt documentation update includes:

- D0 manifest typecheck/tests: PASS, 11 tests;
- D1 provider/adapter/backfill/integration typecheck/tests: PASS, 38 tests;
- Slice C durable-storage/retry/integration tests: PASS, 19 tests;
- Slice B compatibility fixture: PASS, 1 test;
- Slice B projection suite: PASS, 66 tests;
- web checks: PASS, 15 web tests, build, smoke, and submission scan;
- Slice B demo: PASS;
- Slice B HTTP smoke: PASS;
- Slice B adversarial harness: PASS, 13 scenarios;
- Forge format: PASS;
- Forge build: PASS;
- Forge tests: PASS, 96 tests;
- D1 demo, smoke, and adversarial harnesses: PASS;
- protected-path, source scope, secret-like addition, and diff checks: PASS.

The local host used Node `22.23.2`; the repository declares Node `>=24.19.0 <25`. The commands passed with the existing engine warning. CI is configured for Node `24.19.0`.

## Evidence classification

- `VERIFIED_LOCAL`: commands listed above on the D1 worktree.
- `IMPLEMENTED_LOCAL`: provider, adapter, backfill, serialized B/C wrappers, status markers, demo, and tests.
- `FIXTURE_ONLY`: deterministic source blocks, logs, receipts, and fixture identifiers.
- `NOT_VERIFIED`: live provider, current deployment, RPC read, Attestcoin proof, Creditcoin canonical read, hosted durability, browser, and production readiness.
- `VERIFIED_REMOTE`: pending exact-head GitHub workflow readback for the final receipt tree.

## Required publication matrix

Before final report, run on the final D1 tree:

- final local D0/D1/B/C/web/Forge matrix;
- changed-file scope, protected-path, secret-like addition, and diff checks;
- D1 PR #5 is open/draft/unmerged and targets D0;
- the final receipt documentation commit must be pushed;
- read back branch ref, pull ref, PR base/head, state, draft state, and ancestry;
- wait for every required D1 workflow to finish;
- verify each workflow conclusion and exact `headSha` matches the final pushed SHA.

No remote workflow ID or CI conclusion is claimed until it is read back from GitHub at the final D1 SHA.

## Safety result

No wallet, key, signing, broadcast, deployment, proof request, RPC write, fund movement, financial workflow, live provider, or merge was performed.
