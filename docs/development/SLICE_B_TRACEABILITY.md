# Slice B traceability matrix

| Requirement | Code | Test/demo | Evidence/status | Limitation |
|---|---|---|---|---|
| Stable source event identity | `slice-b.ts` `sourceEventId` | stable identity test | `VERIFIED_LOCAL` | source adapter remains local |
| Observation envelope | `ObservationEnvelope` | normalization and ingestion tests | `IMPLEMENTED_LOCAL` | raw payload reference is normalized-only in this slice |
| Duplicate handling | `ingestObservation` | duplicate test | `VERIFIED_LOCAL` | durable store deferred |
| Conflicting observation | `ingestObservation` | conflict path covered by model | `IMPLEMENTED_LOCAL` | no external conflict feed |
| Finality state | `advanceFinality` | finality, monotonic regression, and stale-idempotency tests | `VERIFIED_LOCAL` | policy is proposed local v1 |
| Evidence linkage | `recordEvidence` | evidence-axis, duplicate, cross-relationship conflict tests | `VERIFIED_LOCAL` | no new proof request |
| Creditcoin reference | `recordCanonical` | canonical-axis and collision tests | `VERIFIED_LOCAL` | read transport is injected |
| Reconciliation | `reconcile`, `reconciliationHistory` | current-versus-history transition and mismatch tests | `VERIFIED_LOCAL` | semantic match policy is caller-supplied |
| Provenance | `ProvenanceLink`, deduplicated writes | graph/snapshot and duplicate-evidence tests | `VERIFIED_LOCAL` | no cryptographic provenance receipt |
| Relationship graph | `buildRelationshipGraph` | graph determinism and same-object node-selection tests | `VERIFIED_LOCAL` | derived projection only |
| Checkpoint | `Checkpoint`, `advanceFinality` | target identity, earlier-block replay, missing-history, reorg/finality, monotonicity, sparse cursor, and populated API route | `VERIFIED_LOCAL` | in-memory for current demo |
| Reorg recovery and replay | `replayReorg`, indexed `BlockHeader` history | trusted-target hash, trusted-parent, missing-history, metadata, finality, idempotency, malformed replacement, canonical-header preservation tests | `VERIFIED_LOCAL` | local replacement fixture only |
| Deterministic snapshots | `snapshot`, `snapshotHash`, `restoreSnapshot`, `canonicalize` | independent insertion-order, graph, dead-letter, replay-history, evidence-conflict, meaningful-change, literal-string, legacy-restore tests | `VERIFIED_LOCAL` | no durable artifact store |
| Evidence lookup | `api.evidence`, `/evidence/:id` | known/unknown evidence tests and API smoke | `VERIFIED_LOCAL` | no live proof request |
| Relationship scope | typed composite keys and relationship filters in `api.ts` | same-object, delimiter-collision, scoped-object, investigation/dead-letter/replay tests | `VERIFIED_LOCAL` | global records must be explicit |
| Read-only API | `scripts/slice-b/server.ts`, `api.ts` | local HTTP readback, 405, path traversal, malformed-encoding, and scoped-object smoke | `VERIFIED_LOCAL` | no hosted API |
| Pending proof scenario | `scripts/slice-b/demo.ts` | demo output | `IMPLEMENTED_LOCAL` | fixture-only |
| Mismatch scenario | `scripts/slice-b/demo.ts` | demo output | `IMPLEMENTED_LOCAL` | fixture-only |
| Reorg/replay scenario | `scripts/slice-b/demo.ts` | demo output | `IMPLEMENTED_LOCAL` | fixture-only |
| M9 semantics | existing clearing contracts/tests | `forge test` | `TESTED_TESTNET` historical | unchanged |
| M11 semantics | existing settlement contracts/tests/evidence | `forge test`, historical workflows | `TESTED_TESTNET` historical | not rerun live |
