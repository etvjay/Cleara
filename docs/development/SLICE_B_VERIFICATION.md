# Slice B verification report

## Status

`VERIFIED_REMOTE` for implementation parent `4d78498133ecda75dc69a5e0b49a9b373d8f49de`; the exact-head workflows below all passed on that SHA. This documentation-only receipt is part of the final branch tree and receives its own fresh exact-head checks after push.

## Repository

```text
Repository: etvjay/Cleara
Branch: verification/slice-b
Base: c1065cedb2ae62543bb253d0bad9af23ffd99261
Implementation hardening commit: 4d78498133ecda75dc69a5e0b49a9b373d8f49de
Final pushed implementation SHA: 4d78498133ecda75dc69a5e0b49a9b373d8f49de
Documentation receipt: this final documentation commit; its exact-head runs are read back separately
Draft PR: https://github.com/etvjay/Cleara/pull/1
```

Historical M3-M11 and M11-Lifecycle runs remain separately evidenced. No uninterrupted M3-to-M11 execution is claimed.

## Repaired invariants

- Replay owns an ordered `replayTargets` range. The first target is validated against its own canonical old header, and a successful block-10 replay advances the pending cursor to block 11 without changing the original target prematurely.
- Finality advancement never selects fork candidates; competing same-height hashes remain auditable `CANDIDATE` until validated replay selects one, and at most one header per `(chainKey, blockNumber)` is `CANONICAL`.
- Missing, superseded, parentless, or metadata-inconsistent trusted history leaves the checkpoint `REPLAY_REQUIRED` and replay `BLOCKED`; `backfillReplayHeader` is the explicit recovery path for missing trusted history.
- Replacement identity, predecessor parent, finality, cursor, conflict state, and command shape are validated before promotion or `NOOP`.
- Reorged observations remain auditable history, selected old headers become `SUPERSEDED`, old evidence becomes `STALE`, dependent reconciliation becomes `REORG_DETECTED`, and replay provenance is preserved.
- A range cannot become `CURRENT` while any affected indexed block lacks a finalized, parent-consistent selected replacement; incomplete ranges retain owner, recovery role, reason, and next action.
- Boundary validation rejects metadata drift, nonfinite/fractional values, invalid identifiers, unsafe payloads, and invalid enums before projection mutation, recording typed recovery/dead-letter records.
- Evidence-first and observation-first ingestion converge only on complete source identity; mismatched evidence never attaches and conflicting payloads remain retrievable in full.
- Graph/API reads are rebuilt from current state, so cached projections cannot silently remain current after mutations.
- Reconciliation current state is stored separately from append-only `reconciliationHistory` with per-scope sequence/occurred-at chronology.
- Snapshot restore preserves literal strings, restores only known bigint fields, validates restored records and canonical-height uniqueness, normalizes legacy keys, and remains backward-compatible for older fields.

## Local gates

Executed on the final implementation tree:

```text
corepack pnpm install --frozen-lockfile       PASS
corepack pnpm check:projection                PASS, 59 worker tests
corepack pnpm web:check                       PASS, 15 web tests, build, HTTP smoke, scan
node --import tsx scripts/slice-b/demo.ts    PASS, six assertion-backed scenarios
node scripts/slice-b/smoke.mjs                PASS, checkpoint/evidence/investigation/read-only assertions
node --import tsx scripts/slice-b/adversarial.mjs PASS, 10 explicit invariant scenarios
git diff --check                              PASS
forge fmt --check                             PASS
forge build --sizes                           PASS
forge test -vvv                               PASS, 96 tests
```

Forge was available in the verification environment. Existing timestamp and unsafe-cast warnings remain; no protected contract changed. Local Node is `22.23.2`; the repository declares `24.19.0`.

## Exact-head implementation-parent checks

All checks passed on `4d78498133ecda75dc69a5e0b49a9b373d8f49de`:

- [Contracts](https://github.com/etvjay/Cleara/actions/runs/34704456532) - `success`, `headSha = 4d78498133ecda75dc69a5e0b49a9b373d8f49de`
- [Multichain Execution Projection](https://github.com/etvjay/Cleara/actions/runs/34704456461) - `success`, `headSha = 4d78498133ecda75dc69a5e0b49a9b373d8f49de`
- [Read-only Workbench](https://github.com/etvjay/Cleara/actions/runs/34704456467) - `success`, `headSha = 4d78498133ecda75dc69a5e0b49a9b373d8f49de`

The final documentation-only commit must receive fresh exact-head checks; no older receipt is reused as final-tree CI evidence.

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
- complete two-block replay reaching `CURRENT` and incomplete replay remaining `REPLAY_REQUIRED` with owner/action;
- ordered out-of-order candidates, pending-target advancement, missing-history `backfillReplayHeader`, and replay restart from snapshot;
- one canonical header per chain height, unselected candidates never promoted by finality, same-block event preservation, and candidate ordering;
- strict malformed metadata, nonfinite/fractional values, empty identifiers, payload shape, enum, identity, and typed dead-letter rejection;
- evidence-first/observation-first convergence, full source identity mismatches, conflict payload retrieval, and reorg evidence/reconciliation invalidation;
- graph/API freshness after observation, finality, evidence, canonical, reconciliation, and replay mutations;
- forged replay commands changing relationship, object, chain, domain, parent, height, hash, adapter, schema, or finality cannot return `NOOP`;
- invalid replacement parent;
- successful replay preserving historical reorg data and the latest tip;
- repeated successful replay returning `NOOP`;
- multiple replacement events at one block remain distinct;
- negative, lower, equal, and higher finality inputs;
- global evidence behavior and relationship-scoped conflict isolation;
- `PENDING → MISMATCH → RECONCILED` current-state replacement and investigation cleanup;
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
- insertion-order determinism, graph selection/freshness, meaningful hash changes, malformed path encoding, invalid scope parameters, malformed snapshot rejection, and read-only boundaries.

The standalone adversarial command prints 10 explicit `PASS` lines and exits nonzero on any failure.

## API readback

```text
GET /health
GET /relationships/:id
GET /relationships/:id/timeline
GET /relationships/:id/graph
GET /evidence/:id
GET /facilities/:id?relationshipId=:id
GET /commitments/:id?relationshipId=:id
GET /obligations/:id?relationshipId=:id
GET /settlements/:id?relationshipId=:id
GET /reconciliation/exceptions?relationshipId=:id
GET /investigations?relationshipId=:id
GET /checkpoints
GET /snapshots/:id
```

The local fixture exposes a current `SPARSE_EVENT` checkpoint with chain key `1`, Sepolia chain ID `11155111`, source domain `ethereum-sepolia`, block `10n`, explicit `CURRENT` replay status, and adapter/schema versions. Scoped object routes exclude unrelated and global evidence; unscoped ambiguous objects return `409 AMBIGUOUS_OBJECT_SCOPE`. Graph reads are rebuilt from current state after mutations. All API routes remain read-only.

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
empty/whitespace scope parameter   400 INVALID_PARAMETER
POST /health                       405 READ_ONLY
```

Creditcoin remains canonical financial authority. The API is projection-scoped.

## Evidence classification

- Existing M3-M11 and M11-Lifecycle records: historical `TESTED_TESTNET`, separately evidenced.
- Combined Slice A workbench: `COMPOSITE_FIXTURE`.
- Slice B worker/API/demo/adversarial harness: `IMPLEMENTED_LOCAL` and `LOCAL_PROJECTION`.
- Exact PR workflows: `VERIFIED_REMOTE` for the final pushed tree only after exact-head readback; not live financial evidence.
- Browser verification: `BROWSER_VERIFICATION_BLOCKED`.
- Hosted deployment: `DEPLOYMENT_NOT_VERIFIED`.
- New Attestcoin proof: not requested.
- New Creditcoin state transition: not performed.
- Production persistence/indexing/workers, compliance, custody, ERP/GL, live integrations, and production settlement: deferred.

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
