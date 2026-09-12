# Slice B serialized read-only compatibility contract

Status: `FROZEN_CANDIDATE` for Slice C consumers

Contract version: `slice-b-read-model-contract-v1`

This document defines the only Slice B surface that Slice C may consume. Slice C must use the serialized/read-only adapter returned by `createSliceBApi(state)` and the serialized snapshot boundary. It must not import or mutate Slice B's internal maps, construct accepted records by hand, or treat the projection as canonical financial authority.

## Authority boundary

- Creditcoin CC3 remains canonical coordination and financial authority.
- Source chains remain authoritative for native source actions and source facts.
- Attestcoin is evidence for source facts, not financial judgment or execution authority.
- Slice B is a deterministic local/in-memory indexed relationship projection.
- The API, graph, provenance, and snapshot are read-model surfaces. They cannot perform financial writes.

`FINALIZED` is not `PROVEN`; `PROVEN` is not financial authorization; `INDEXED` is not `CANONICAL`; `RECONCILED` is not inferred from a local snapshot.

## Public adapter

The adapter exposes these read-only methods:

```text
health()
checkpoint(chainKey)
relationship(relationshipId)
object(objectId, optional relationshipId)
evidence(evidenceId, optional relationshipId)
timeline(relationshipId)
graph(relationshipId)
investigations(optional relationshipId)
reconciliation(relationshipId)
checkpoints()
snapshot()
serializeSnapshot()
```

`restoreSnapshot(serialized)` is the named kernel restore boundary exported by Slice B. It returns a newly validated state or fails without mutating an existing state. `snapshot()` and `serializeSnapshot()` return `{ hash, body }`; the body is the serialized snapshot and the hash is recomputed from the canonical body.

The HTTP server is transport only. All routes are GET-only read routes; mutation methods return `405 READ_ONLY`.

## Returned record semantics

Every returned record must preserve these distinctions:

- **canonical:** an explicit Creditcoin/source authority reference, never implied by projection presence;
- **observed/indexed:** source observation and block/finality facts accepted by the local indexer;
- **derived:** graph, provenance, reconciliation, and projection values computed from accepted records;
- **fixture-derived:** values from a local composite fixture, never live financial state;
- **inferred:** a value that remains explicitly non-authoritative and cannot authorize a write.

Records retain, where applicable:

- deterministic identity and source coordinates;
- relationship or explicit global scope;
- current observation/finality/evidence/canonical/projection/reconciliation status;
- source observation and block continuity;
- evidence status and evidence level/mode;
- Creditcoin reference and read status separately from source proof;
- authority, blocked reason, recovery role, and next permitted action;
- provenance references only when the referenced accepted record exists in the same scope;
- current reconciliation state separately from append-only history.

## Scope rules

- Relationship-scoped reads never expose another relationship's evidence, canonical reference, reconciliation, investigation, or replay record.
- Global evidence is represented with `relationshipId: null` and is not relabeled as relationship evidence.
- An unscoped ambiguous object returns `409 AMBIGUOUS_OBJECT_SCOPE`.
- Typed routes validate object type and relationship scope.
- Malformed identifiers, URL encodings, traversal attempts, and invalid query parameters return typed errors, not stack traces.

## Mutation kernel contract

The public mutation functions are local state transitions only:

```text
ingestObservation
advanceFinality
recordEvidence
recordCanonical
reconcile
backfillReplayHeader
replayReorg
projectRelationship
restoreSnapshot
```

Each boundary:

- accepts unknown runtime input defensively;
- validates before dereferencing nested fields;
- returns a typed state/result or a typed dead-letter/rejection record;
- never stores malformed input as accepted/current/canonical;
- uses deterministic identity and canonical serialization;
- retains historical reorg/superseded/conflict evidence;
- cannot sign, broadcast, request proofs, move funds, or write Creditcoin.

Replay is idempotent only for an exact previously completed command. A changed target, relationship, source identity, evidence identity, parent, finality, metadata, reference, timestamp, or checkpoint expectation is not `NOOP`.

Finality advancement cannot select a fork candidate or clear `REPLAY_REQUIRED`. A range becomes `CURRENT` only after each affected indexed block has a finalized, parent-consistent, explicitly selected replacement.

## Snapshot contract

Snapshot restore is atomic and validates schema version, map keys, identities, scope, statuses, metadata, replay ranges, canonical-height uniqueness, graph/provenance references, conflict payloads, chronology, safe object structure, and known bigint fields. Literal strings such as `123n` remain strings unless they occur in an allowlisted bigint field. Legacy snapshots are migrated by a named compatibility path before the same validation.

## Slice C compatibility test

`workers/multichain-execution/test/slice-b-compatibility.test.ts` exercises this contract without accessing internal mutable maps. A Slice C implementation is compatible only if that fixture and the serialized snapshot round-trip remain green against the final Slice B tree.

## Evidence ceiling

This contract is `IMPLEMENTED_LOCAL` / `LOCAL_PROJECTION`. It does not prove production persistence, complete backfill, hosted worker durability, live provider behavior, hosted deployment, browser correctness, or canonical financial state. Browser and deployment status must remain explicit and separate.
