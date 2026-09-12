# Slice B verification report

## Status

`VERIFIED_REMOTE` for hardening implementation commit `b2a6b8fab45eb9491aef1653ac8f0c8186bed859`. The exact-head implementation workflows and all local gates are recorded below. The final branch head may include documentation-only receipt updates and is reported separately.

## Repository

```text
Repository: etvjay/Cleara
Branch: verification/slice-b
Base: c1065cedb2ae62543bb253d0bad9af23ffd99261
Implementation hardening commit: b2a6b8fab45eb9491aef1653ac8f0c8186bed859
Draft PR: https://github.com/etvjay/Cleara/pull/1
```

Historical M3-M11 and M11-Lifecycle runs remain separately evidenced. No uninterrupted M3-to-M11 execution is claimed.

## Repaired invariants

- Replay requires a `CANONICAL` trusted `BlockHeader` from `state.blockHistory`. No observation fallback can promote a replacement.
- Replay checkpoints store `replayFromBlock`, `replayOldBlockHash`, and `replayParentBlockHash` separately from the latest observed tip identity.
- Earlier-block replay resolves the old hash from the target block header, not from `lastObservedBlockHash`.
- Missing, superseded, parentless, or metadata-inconsistent trusted history leaves the checkpoint `REPLAY_REQUIRED` and replay `BLOCKED`.
- Replacement identity, predecessor parent, finality, cursor, and conflict state are validated before promotion.
- Reorged observations remain auditable history and replay provenance is preserved.
- Multiple replacement events at one block do not reorg one another; old-fork observations are the records superseded by replay.
- `advanceFinality` and successful replay are monotonic. Lower inputs cannot regress finalized height or demote observations. Equal stale inputs are no-ops.
- Cursor semantics are explicitly `SPARSE_EVENT`: latest observed event block, not a complete chain-header cursor. Replay still requires indexed canonical history for the superseded event block.
- Reconciliation current state is stored separately from append-only `reconciliationHistory`; investigations use current state while relationship reads expose both.
- Attestcoin evidence IDs are globally unique. Identical records are idempotent; conflicting content preserves the original and records every distinct conflict without replacing trusted evidence.
- Typed length-prefixed composite keys and hash inputs prevent delimiter collisions across relationships, objects, block headers, and source identities.
- Relationship-scoped investigations and object reads exclude unrelated relationship records and global records unless the query is unscoped.
- Snapshot restore preserves literal strings, restores only known bigint fields, normalizes legacy keys, and remains backward-compatible for older fields.
- Canonical block headers are not demoted when another event from the same canonical block is ingested.

## Local gates

Executed on the final implementation tree:

```text
corepack pnpm install --frozen-lockfile       PASS
corepack pnpm check:projection                PASS, 40 worker tests
corepack pnpm web:check                       PASS, 15 web tests, build, HTTP smoke, scan
node --import tsx scripts/slice-b/demo.ts    PASS, six assertion-backed scenarios
node scripts/slice-b/smoke.mjs                PASS, checkpoint/evidence/investigation/read-only assertions
git diff --check                              PASS
forge fmt --check                             PASS
forge build --sizes                           PASS
forge test -vvv                               PASS, 96 tests
```

Forge was available in the verification environment. Existing timestamp and unsafe-cast warnings remain; no protected contract changed. Local Node is `22.23.2`; the repository declares `24.19.0`.

## Exact-head implementation PR checks

All checks passed on `b2a6b8fab45eb9491aef1653ac8f0c8186bed859`:

- [Contracts](https://github.com/etvjay/Cleara/actions/runs/34692283747) - `success`
- [Multichain Execution Projection](https://github.com/etvjay/Cleara/actions/runs/34692283754) - `success`
- [Read-only Workbench](https://github.com/etvjay/Cleara/actions/runs/34692283749) - `success`

The run API readback confirmed each `headSha` matched the implementation commit.

## Adversarial assertions

The repaired suite covers:

- empty block history;
- missing target history before candidate ingestion;
- missing old canonical header;
- superseded old header;
- missing trusted parent hash;
- checkpoint parent mismatch;
- replacement parent mismatch;
- trusted-header metadata mismatch;
- wrong chain key and chain ID;
- wrong source domain, adapter version, schema version, and block number;
- unfinalized replacement;
- earlier-block replay using the target old hash;
- successful replay preserving historical reorg data;
- repeated successful replay returning `NOOP`;
- multiple replacement events at one block;
- lower/equal finality regression and idempotency, including replay success;
- sparse event blocks without fabricated contiguous-header claims;
- same global evidence ID across relationships;
- original evidence preservation and multiple distinct conflict records;
- relationship-scoped replay attempts, dead letters, objects, and investigations;
- global dead-letter context in unscoped investigations;
- current reconciliation versus append-only history, including repeated state cycles;
- canonical-header preservation for additional same-block events;
- delimiter-collision-resistant keys and hashes;
- backward-compatible snapshot restore with legacy keys and fields;
- literal strings that resemble bigint values;
- insertion-order determinism, graph selection, meaningful hash changes, malformed path encoding, and read-only boundaries.

## API readback

```text
GET /health
GET /relationships/:id
GET /relationships/:id/timeline
GET /relationships/:id/graph
GET /evidence/:id
GET /facilities/:id
GET /commitments/:id
GET /obligations/:id
GET /settlements/:id
GET /reconciliation/exceptions?relationshipId=:id
GET /investigations?relationshipId=:id
GET /checkpoints
GET /snapshots/:id
```

The local fixture exposes a current `SPARSE_EVENT` checkpoint with chain key `1`, Sepolia chain ID `11155111`, source domain `ethereum-sepolia`, block `10n`, explicit `CURRENT` replay status, and adapter/schema versions. All API routes remain read-only.

Expected behavior includes:

```text
known evidence                     200
known relationship                 200
scoped investigations              200
scoped reconciliation exceptions   200
checkpoints                        200, populated
unknown object                     404 NOT_INDEXED
ambiguous object scope             409 AMBIGUOUS_OBJECT_SCOPE
malformed path encoding            404 NOT_INDEXED
POST /health                       405 READ_ONLY
```

Creditcoin remains canonical financial authority. The API is projection-scoped.

## Evidence classification

- Existing M3-M11 and M11-Lifecycle records: historical `TESTED_TESTNET`, separately evidenced.
- Combined Slice A workbench: `COMPOSITE_FIXTURE`.
- Slice B worker/API/demo: `IMPLEMENTED_LOCAL` and `LOCAL_PROJECTION`.
- Exact PR workflows: remote verification of code and checks only, not live financial evidence.
- New Attestcoin proof: not requested.
- New Creditcoin state transition: not performed.

## Security and authority

- No wallet or private-key access.
- No secrets read or printed.
- No RPC writes.
- No proof requests.
- No funds moved.
- No signing or broadcasting.
- No mutation API route.
- M9 and M11 contracts were not modified.
- No Nomos package or Nomos authority contract exists. Nomos remains conceptual.

## Remaining limits

- Checkpoints, block history, reconciliation history, and replay state are deterministic local read-model state, not production durable storage.
- Sparse event semantics do not claim complete chain-header continuity outside indexed event blocks.
- No live RPC backfill or external provider adapter is connected.
- No production retry/dead-letter service exists.
- Browser verification is `BROWSER_VERIFICATION_BLOCKED` because the browser harness could not attach to Chromium.
- Hosted deployment is `DEPLOYMENT_NOT_VERIFIED`.
- No production indexer, API, or frontend claim is made.
- No custody, compliance, ERP/GL, mainnet, or production settlement claim is made.
