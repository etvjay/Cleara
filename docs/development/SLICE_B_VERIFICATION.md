# Slice B verification report

## Status

`VERIFIED_REMOTE`: Slice B code and the repaired receipt checkpoint passed exact-head remote CI. The final docs-only receipt tree is verified separately by the final branch/PR ref and workflow `headSha` readback; this file avoids a self-referential commit hash. Browser verification remains `BROWSER_VERIFICATION_BLOCKED`. Hosted deployment remains `DEPLOYMENT_NOT_VERIFIED`.

## Repository

```text
Repository: etvjay/Cleara
Repair branch: verification/slice-b
Starting head: f3ceae3d829bd0bb2b065e057de1f84d92f5ecd2
Primary blocker-closure implementation checkpoint: 37072a72a361ab4f8ce2ca890135d104d5bd7dc7
Final code-bearing checkpoint: b3f4288af9b6e1d59e8ce5a98294121dad148fa4
Frozen consumer contract: slice-b-read-model-contract-v1
Last exact workflow-verified receipt tree: d7af2dfcd91371916f5e1ad36aecb7d177e7c9d6
Last exact workflow IDs: 34719287193 (Contracts), 34719287198 (Projection), 34719287194 (Workbench)
Final docs-only tree: verified by final branch/PR ref and final workflow `headSha` readback
```

The prior `verification/slice-b` receipts are historical evidence for that earlier tree and are not reused as evidence for this repair branch.

## Scope

Slice B remains local, deterministic, in-memory, read-only, and non-production. Creditcoin CC3 remains the canonical financial authority. Source chains remain authoritative for native actions. Attestcoin is evidence and continuity, not financial judgment or execution authority. Nomos remains conceptual. No wallet, signer, RPC write, proof request, deployment, bridge, custody, settlement adapter, or live workflow was used.

Slice C work is isolated from this branch and cannot be used to close Slice B. The serialized consumer contract is [`SLICE_B_COMPATIBILITY_CONTRACT.md`](./SLICE_B_COMPATIBILITY_CONTRACT.md).

## Repaired and demonstrated invariants

- Unknown, null, primitive, malformed, cyclic, and unsafe public inputs produce bounded typed recovery/dead-letter records or typed errors. They do not escape through field dereferences.
- Source scope is configured explicitly with chain ID, source domain, adapter/schema, finality policy, cursor mode, and a trusted anchor. The first observation cannot poison those values or bypass parent continuity.
- Fork candidates can retain source finality, but canonical header selection and graph currentness remain separate. Finality never promotes a candidate.
- Evidence requires complete source identity, including recomputed source-event identity. Mismatched, late, stale, and reorged evidence cannot appear accepted/current. Evidence-first and observation-first valid arrivals converge deterministically.
- Replay `NOOP` is bound to the complete replacement envelope, options, and pre-command checkpoint. Changed timestamps, references, metadata, parents, targets, or scope cannot reuse an old command.
- Replay ranges remain ordered. Incomplete or missing trusted history stays `REPLAY_REQUIRED`/`BLOCKED` with recovery metadata.
- Snapshot restore validates raw map keys, duplicate entries, source-scope/checkpoint agreement, canonical uniqueness, graph edges, provenance references, replay hashes, dead-letter fields, and known bigint fields before returning. Rejection is atomic.
- Block and projector keys include complete source scope, preventing same-height collisions across chain/domain/adapter/schema interpretations.
- Caller-supplied derived references are cleared at ingestion and can only be attached by validated state transitions.
- Resource routes enforce expected object type, scope, read-only method behavior, safe path decoding, and bounded malformed-request responses.
- Reconciliation chronology and graph/API reads remain deterministic and fresh after mutations.

## Local verification matrix

Executed from the repair worktree:

```text
corepack pnpm install --frozen-lockfile       PASS, baseline and repair tree
corepack pnpm --filter @cleara/multichain-execution typecheck PASS
node --import tsx --test workers/multichain-execution/test/*.test.ts PASS, 66 tests
node --import tsx scripts/slice-b/demo.ts    PASS
node --import tsx scripts/slice-b/adversarial.mjs PASS, 13 scenarios
node scripts/slice-b/smoke.mjs                PASS
corepack pnpm check:projection                PASS, 66 worker tests
corepack pnpm web:check                       PASS, 15 web tests, build, HTTP smoke, scan
git diff --check                              PASS
forge fmt --check                             PASS
forge build --sizes                           PASS
forge test -vvv                               PASS, 96 tests
```

The focused red/green regression set covers bootstrap poisoning, null boundaries, strict evidence identity, late/reorg evidence, full replay identity, snapshot corruption, graph/provenance dangling references, projector scope collisions, route typing, untrusted references, chronology, and insertion-order determinism.

## API boundary

The local server exposes only read routes. Object routes map resource names to expected object types. A wrong-type identifier is not returned as a successful object. `POST`, unknown resources, malformed scopes, traversal-like paths, and malformed encodings remain bounded read-only errors.

## Evidence classification

- Slice B code and regression tests: `IMPLEMENTED_LOCAL` until final exact-head remote verification.
- Local demo, adversarial, and HTTP smoke: `VERIFIED_LOCAL` for the exact worktree commands.
- Exact PR workflows: `VERIFIED_REMOTE` only after final pushed SHA and run `headSha` readback.
- Browser: `BROWSER_VERIFICATION_BLOCKED`.
- Hosted deployment: `DEPLOYMENT_NOT_VERIFIED`.
- Historical M3-M11 and M11-Lifecycle records: separate historical `TESTED_TESTNET` evidence.
- Slice C lanes: independent candidates, not Slice B evidence.

## Security and authority

No secrets, private keys, wallets, browser profiles, or credential values were accessed or added. No chain write, proof request, signing, broadcast, fund movement, deployment, or live workflow dispatch occurred. Protected paths remain excluded: `contracts/**`, `test/**`, `evidence/runtime/**`, `docs/canonical/GROUND_TRUTH.md`, and unrelated protocol expansion.

## Remaining limits

- Slice B has no durable persistence, external provider adapter, production backfill worker, or operational retry/dead-letter service.
- Sparse-event cursors do not claim complete chain-header continuity outside indexed event blocks.
- No new live Attestcoin or Creditcoin evidence was generated.
- Browser verification is blocked by unavailable browser attachment.
- Hosted deployment was not performed.
- No production indexer, custody, compliance, ERP/GL, mainnet, or production settlement claim is made.
