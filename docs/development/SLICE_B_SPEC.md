# Slice B specification

## Claim

Slice B is a finality-aware, replayable, provenance-linked indexed relationship read model for inspecting external observations, Attestcoin evidence, Creditcoin canonical references, reconciliation, and derived relationship context.

It is `IMPLEMENTED_LOCAL`. It is not a production indexer, proof-submission worker, Creditcoin write path, settlement engine, or canonical database.

## Product outcome

An institution can inspect what happened, what is proven, what Creditcoin recognizes, what remains uncertain, and what must happen next.

## Data flow

```text
observation envelope
→ stable identity and normalization
→ duplicate/conflict handling
→ finality evaluation
→ evidence linkage
→ Creditcoin read reference
→ reconciliation
→ provenance
→ deterministic relationship graph
→ snapshot/API
```

## Status axes

The implementation keeps these axes independent:

- observation: observed, malformed, duplicate, conflicting, unavailable;
- finality: unknown, pending, finalized, reorged;
- evidence: not requested, pending, accepted, rejected, consumed, stale;
- canonical: not read, read, matched, conflicting, unavailable;
- projection: not indexed, indexed, stale, reorged, replay required, rejected;
- reconciliation: unknown, pending, reconciled, mismatch, stale, reorg detected, rejected;
- operation: ready, blocked, retryable, dead letter, recovery required, terminal failure.

No axis promotes another. `FINALIZED` is not `PROVEN`, `PROVEN` is not `ACCEPTED`, `INDEXED` is not `CANONICAL`, and `RECONCILED` is not inferred from a local snapshot alone.

## Cursor and continuity semantics

Slice B uses a `SPARSE_EVENT` cursor. `lastObservedBlock` means the latest indexed event block, not a complete chain-header cursor. `blockHistory` contains headers for indexed event blocks only; gaps with no relevant events are permitted. Reorg replay is stronger than ordinary sparse observation: it requires a `CANONICAL` trusted header for the superseded indexed event block, a valid parent hash, and matching checkpoint metadata. Missing or superseded trusted history blocks replay and leaves `REPLAY_REQUIRED`.

Finality is monotonic. Lower or equal finality inputs cannot regress a checkpoint or demote finalized observations. Identical stale inputs are no-ops.

## Evidence identity scope

Attestcoin evidence IDs are globally unique in this local model. Identical content is idempotent. Conflicting content using an existing evidence ID rejects the original record without replacing it and creates an explicit relationship-scoped evidence-conflict investigation. A conflicting record is never attached to the other relationship's evidence view.


```text
domain + chainKey + transactionHash + eventIndex
```

Observation identity additionally includes event type. Duplicate observations remain represented. A conflicting payload is marked conflicting. A reorged observation remains auditable and is not erased.

## Read-only API

The local server exposes:

```text
GET /health
GET /relationships/relationship:slice-b:fixture
GET /relationships/relationship:slice-b:fixture/timeline
GET /relationships/relationship:slice-b:fixture/graph
GET /facilities/:id
GET /commitments/:id
GET /obligations/:id
GET /settlements/:id
GET /evidence/:id
GET /reconciliation/exceptions?relationshipId=:id
GET /investigations?relationshipId=:id
GET /checkpoints
GET /snapshots/relationship:slice-b:fixture
```

All responses are projection-scoped and carry `source: projection`, `canonical: false`, or an equivalent explicit boundary. There are no mutation routes.

## M12 handoff

M12 can consume:

- stable source event IDs;
- separate observation/finality/evidence/canonical/projection/reconciliation states;
- checkpoints and replay status;
- provenance links;
- deterministic graph schema and hash;
- investigation records with owner and next action;
- read-only relationship/timeline/graph/snapshot routes.

M12 must not treat any of these as authority to mutate Creditcoin or perform clearing.
