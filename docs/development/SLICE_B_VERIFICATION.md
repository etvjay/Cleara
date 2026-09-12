# Slice B verification report

## Status

`CHANGES_REQUIRED` was the starting status for this repair. The implementation repair is now committed at `701022d0df6e74f22c39d54d6a80ec9671e1b0b9`; final promotion remains gated on the new exact-head PR checks.

## Repository

```text
Repository: etvjay/Cleara
Branch: verification/slice-b
Base: c1065cedb2ae62543bb253d0bad9af23ffd99261
Implementation repair commit: 701022d0df6e74f22c39d54d6a80ec9671e1b0b9
Draft PR: https://github.com/etvjay/Cleara/pull/1
```

The historical M3-M11 runs remain separately evidenced. This branch does not claim one uninterrupted M3-to-M11 execution.

## Repaired invariants

- Replay records a trusted predecessor from indexed canonical block history. A replacement cannot supply its own expected parent.
- Replay validates chain key, chain ID, source domain, adapter version, observation schema, replay cursor, source identity, finality, and replacement block identity.
- Invalid, malformed, conflicting, or unfinalized replacements remain `REPLAY_REQUIRED`.
- Successful replay preserves the old observation as `REORGED`/superseded, promotes only the validated replacement, and is idempotent.
- Canonical records use relationship/object composite keys. Same object IDs in different relationships cannot overwrite one another.
- Identical evidence, canonical, reconciliation, and provenance writes are stable no-ops. Conflicting evidence is explicitly rejected/marked conflicting.
- Snapshot and graph determinism tests use independently constructed states, not self-comparison.
- The local fixture server advances its seeded observation through `advanceFinality` and exposes a real current checkpoint.

## Local gates

Executed from the isolated verification worktree:

```text
corepack pnpm install --frozen-lockfile       PASS
corepack pnpm check:projection                PASS, 24 worker tests
corepack pnpm web:check                       PASS, 15 web tests, build, HTTP smoke, scan
node --import tsx scripts/slice-b/demo.ts    PASS, six assertion-backed scenarios
node scripts/slice-b/smoke.mjs                PASS, checkpoint/evidence/read-only assertions
git diff --check                              PASS
forge fmt --check                             PASS
forge build --sizes                           PASS
forge test -vvv                               PASS, 96 tests
```

The local Node runtime is `22.23.2`; the repository declares Node `24.19.0`. Foundry is available locally. Existing Foundry timestamp and unsafe-cast warnings remain; no protected contract changed.

## Slice B assertions

The repaired suite covers:

- reorg detection sets `REPLAY_REQUIRED`;
- finality advancement cannot clear `REPLAY_REQUIRED`;
- invalid predecessor parent is rejected;
- valid trusted predecessor is accepted;
- wrong chain key and chain ID are rejected;
- wrong source domain, adapter version, schema version, and block number are rejected;
- unfinalized replacement remains blocked;
- successful replay promotes only the replacement;
- old observations remain `REORGED` and auditable;
- replay is idempotent and does not double-count current observations;
- known evidence lookup returns a record;
- duplicate evidence is idempotent after restart;
- conflicting evidence is explicitly rejected;
- same object IDs remain isolated by relationship;
- equivalent insertion orders produce equal serialized snapshots and hashes;
- graph hashes and node selection are deterministic;
- meaningful state changes produce different hashes;
- snapshot restore preserves the hash;
- dead-letter, provenance, replay-history, block-history, and map ordering are canonicalized;
- the demo exits nonzero on failed assertions;
- the API exposes no write method and rejects non-GET requests.

## API readback

The local API exposes:

```text
GET /health
GET /relationships/relationship:slice-b:fixture
GET /relationships/relationship:slice-b:fixture/timeline
GET /relationships/relationship:slice-b:fixture/graph
GET /evidence/evidence:slice-b-settlement
GET /facilities/:id
GET /commitments/:id
GET /obligations/:id
GET /settlements/:id
GET /reconciliation/exceptions
GET /investigations
GET /checkpoints
GET /snapshots/relationship:slice-b:fixture
```

The deterministic server fixture now returns one current checkpoint with chain key `1`, Sepolia chain ID `11155111`, source domain `ethereum-sepolia`, block `10n`, explicit `CURRENT` replay status, adapter/schema versions, and projection schema version.

Expected behavior:

```text
known relationship       200
known evidence           200
known indexed settlement 200
checkpoints              200, at least one current checkpoint
unknown object           404 NOT_INDEXED
ambiguous object scope   409 AMBIGUOUS_OBJECT_SCOPE
POST /health             405 READ_ONLY
```

All responses remain projection-scoped. Creditcoin remains canonical financial authority.

## Evidence classification

- Existing M3-M11 and M11-Lifecycle records: historical `TESTED_TESTNET`, separately evidenced.
- Combined Slice A workbench: `COMPOSITE_FIXTURE`.
- Slice B local worker/API/demo: `IMPLEMENTED_LOCAL` and `LOCAL_PROJECTION`.
- Pull-request CI: remote verification of code and checks only; it does not create live financial evidence.
- New Attestcoin proof: not requested.
- New Creditcoin state transition: not performed.

## Security and authority

- No wallet or private-key access.
- No secrets read or printed.
- No RPC writes.
- No proof requests.
- No funds moved.
- No transaction signing or broadcasting.
- No mutation API route.
- Projection cannot be marked canonical through the API.
- M9 and M11 contracts were not modified.
- No Nomos package or Nomos authority contract exists in this branch. Nomos remains conceptual.

## Remaining limits

- Checkpoints and replay state are deterministic local read-model state, not production durable storage.
- No live RPC backfill or external provider adapter is connected.
- No production retry/dead-letter service exists.
- Browser verification is `BROWSER_VERIFICATION_BLOCKED` because the browser harness could not attach to Chromium.
- Hosted deployment is `DEPLOYMENT_NOT_VERIFIED`.
- No production indexer, API, or frontend claim is made.
- No custody, compliance, ERP/GL, mainnet, or production settlement claim is made.
