# Slice B specification

## Claim

Slice B is a finality-aware, replayable, provenance-linked indexed relationship read model for inspecting external observations, Attestcoin evidence, Creditcoin canonical references, reconciliation, and derived relationship context.

It is `IMPLEMENTED_LOCAL`. It is not a production indexer, proof-submission worker, Creditcoin write path, settlement engine, or canonical database.

The public handoff is frozen as `slice-b-read-model-contract-v1` in [`SLICE_B_COMPATIBILITY_CONTRACT.md`](./SLICE_B_COMPATIBILITY_CONTRACT.md). Slice C may consume the serialized read-only surface only; it may not import or mutate Slice B internals.

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

- observation: observed, malformed, duplicate, conflicting, unavailable, rejected;
- finality: unknown, pending, finalized, reorged;
- evidence: not requested, pending, accepted, rejected, consumed, stale;
- canonical: not read, read, matched, conflicting, unavailable;
- projection: not indexed, indexed, stale, reorged, replay required, rejected;
- reconciliation: unknown, pending, reconciled, mismatch, stale, reorg detected, rejected;
- operation: ready, blocked, retryable, dead letter, recovery required, terminal failure.

No axis promotes another. `FINALIZED` is not `PROVEN`, `PROVEN` is not `ACCEPTED`, `INDEXED` is not `CANONICAL`, and `RECONCILED` is not inferred from a local snapshot alone.

## Cursor and continuity semantics

Slice B uses a `SPARSE_EVENT` cursor. `lastObservedBlock` means the latest indexed event block, not a complete chain-header cursor. `blockHistory` contains headers for indexed event blocks only; gaps with no relevant events are permitted. A replay checkpoint stores an ordered `replayTargets` range. Each target carries the affected height, superseded hash, old parent, and currently expected replacement parent. The compatibility fields `replayFromBlock`, `replayOldBlockHash`, and `replayParentBlockHash` always describe the first pending target, while `lastObservedBlockHash` remains the tip identity. Reorg replay requires a `CANONICAL` trusted header for the next affected indexed event block, exact checkpoint/profile metadata, a valid old-parent link, a finalized indexed replacement, and a replacement parent matching the selected predecessor. Candidates arriving out of order remain auditable and cannot replace the first pending target. After a successful target replay, the cursor advances to the next target; only after every affected indexed block has a selected replacement can the checkpoint become `CURRENT`. Missing trusted history returns `BLOCKED` with `REPLAY_REQUIRED`, an owner, recovery role, and an explicit `backfillReplayHeader` action. Old observations become `REORGED`, selected old headers become `SUPERSEDED`, replay provenance is retained, and the latest replacement tip is preserved. Finality advancement never selects fork candidates and never creates two canonical headers at one chain height.

Finality is monotonic across observation advancement and replay promotion. Lower or equal finality inputs cannot regress a checkpoint or demote finalized observations. Negative, nonfinite, fractional, or otherwise invalid values create typed finality rejection records without mutating projection state. Identical valid replay commands return `NOOP` only after command shape, identity, target, trusted history, parent, finality, and indexed replacement validation.

## Explicit source-scope bootstrap

Each state is created with one or more explicit `SourceScopeDescriptor` records. A descriptor fixes `chainKey`, source `chainId`, source domain, adapter version, observation schema, finality policy, cursor mode, and a trusted anchor block/hash. The first observation must match the descriptor and must link to the configured anchor. The first observation cannot define or replace those values. A wrong initial parent remains a noncanonical candidate and cannot become a current graph node. Candidate source finality is kept separate from canonical header selection.

Every block/header identity includes the complete source scope, not only chain key and height. Observation caller-supplied evidence, Creditcoin, projection, and reconciliation references are cleared at ingestion and can be attached only through validated state transitions. Invalid inputs produce bounded records with stable error codes, recovery role, and next action rather than uncaught exceptions.

## Evidence identity scope

Attestcoin evidence IDs are globally unique in this local model. Evidence linkage requires the complete source identity: source domain, chain key and chain ID, transaction hash, event index, block number, block hash, source event ID, and relationship policy. Evidence-first and observation-first arrival converge when those fields match exactly. Mismatched evidence is retained only as an unlinked/rejected record with recovery ownership; global evidence is never relabeled as relationship evidence. Identical content is idempotent. Conflicting content using an existing evidence ID preserves the original record byte-for-byte and creates an explicit conflict containing the complete accepted and conflicting payloads, not hashes alone. A conflicting record is never attached to the other relationship's evidence view. On reorg, evidence linked only to superseded observations becomes `STALE`, and dependent current reconciliation becomes `REORG_DETECTED` until replacement evidence is supplied.

```text
domain + chainKey + transactionHash + eventIndex
```

Observation identity additionally includes event type. Duplicate observations remain represented. A conflicting payload is marked conflicting. A reorged observation remains auditable and is not erased.

## Reconciliation current state and history

`reconciliations` is the current record for each typed relationship/source-event/canonical-object scope. Each transition receives a stable per-scope `sequence` and deterministic `occurredAt`; `reconciliationHistory` preserves semantic order within a scope while scopes are ordered deterministically for snapshots. A state transition replaces only that current entry and appends the transition to history. Investigation reads use current reconciliation state, while relationship reads expose both current state and append-only history. This prevents stale historical mismatches from being presented as current state and preserves `PENDING → MISMATCH → PENDING` across restart.

Canonical, block-history, and reconciliation map keys use typed length-prefixed composite encoding. Hash inputs use the same component-boundary principle, so delimiter characters in relationship IDs, object IDs, block hashes, or source identities cannot merge distinct records. Snapshot restore validates raw map keys, duplicate entries, source-scope/checkpoint agreement, canonical-height uniqueness, graph edges, provenance references, replay command hashes, and dead-letter fields before returning a state. It is atomic: a rejected snapshot cannot partially modify the caller's state. Named legacy key formats are migrated only when their value identity matches exactly.

## Read-only API

The local server exposes:

```text
GET /health
GET /relationships/relationship:slice-b:fixture
GET /relationships/relationship:slice-b:fixture/timeline
GET /relationships/relationship:slice-b:fixture/graph
GET /facilities/:id?relationshipId=:id
GET /commitments/:id?relationshipId=:id
GET /obligations/:id?relationshipId=:id
GET /settlements/:id?relationshipId=:id
GET /evidence/:id
GET /reconciliation/exceptions?relationshipId=:id
GET /investigations?relationshipId=:id
GET /checkpoints
GET /snapshots/relationship:slice-b:fixture
```

All responses are projection-scoped and carry `source: projection`, `canonical: false`, or an equivalent explicit boundary. Graph reads are rebuilt from current state on every read, so cached graphs cannot silently remain current after observation, finality, evidence, canonical, reconciliation, or replay mutations. Scoped object routes require a matching relationship record and exclude global or unrelated records; unscoped ambiguous objects return `409 AMBIGUOUS_OBJECT_SCOPE`. Empty or whitespace-only scope parameters and malformed path encodings are rejected safely. There are no mutation routes.

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
