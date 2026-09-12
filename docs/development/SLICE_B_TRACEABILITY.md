# Slice B traceability matrix

| Requirement | Code | Test/demo | Evidence/status | Limitation |
|---|---|---|---|---|
| Stable source event identity | `slice-b.ts` `sourceEventId` | stable identity test | `VERIFIED_LOCAL` | source adapter remains local |
| Observation envelope | `ObservationEnvelope` | normalization and ingestion tests | `IMPLEMENTED_LOCAL` | raw payload reference is normalized-only in this slice |
| Duplicate handling | `ingestObservation` | duplicate test | `VERIFIED_LOCAL` | durable store deferred |
| Conflicting observation | `ingestObservation` | conflict path covered by model | `IMPLEMENTED_LOCAL` | no external conflict feed |
| Finality state | `advanceFinality` | finality test | `VERIFIED_LOCAL` | policy is proposed local v1 |
| Evidence linkage | `recordEvidence` | evidence-axis test | `VERIFIED_LOCAL` | no new proof request |
| Creditcoin reference | `recordCanonical` | canonical-axis test | `VERIFIED_LOCAL` | read transport is injected |
| Reconciliation | `reconcile` | mismatch test | `VERIFIED_LOCAL` | semantic match policy is caller-supplied |
| Provenance | `ProvenanceLink` | graph/snapshot test | `IMPLEMENTED_LOCAL` | no cryptographic provenance receipt |
| Relationship graph | `buildRelationshipGraph` | graph determinism test | `VERIFIED_LOCAL` | derived projection only |
| Checkpoint | `Checkpoint` | reorg test and API route | `IMPLEMENTED_LOCAL` | in-memory for current demo |
| Reorg recovery signal | `ingestObservation` | reorg test | `VERIFIED_LOCAL` | replay executor remains local handoff |
| Deterministic snapshots | `snapshot`, `snapshotHash` | deterministic hash test | `VERIFIED_LOCAL` | no durable artifact store |
| Read-only API | `scripts/slice-b/server.ts`, `api.ts` | local HTTP readback | `VERIFIED_LOCAL` | no hosted API |
| Pending proof scenario | `scripts/slice-b/demo.ts` | demo output | `IMPLEMENTED_LOCAL` | fixture-only |
| Mismatch scenario | `scripts/slice-b/demo.ts` | demo output | `IMPLEMENTED_LOCAL` | fixture-only |
| Reorg/replay scenario | `scripts/slice-b/demo.ts` | demo output | `IMPLEMENTED_LOCAL` | fixture-only |
| M9 semantics | existing clearing contracts/tests | `forge test` | `TESTED_TESTNET` historical | unchanged |
| M11 semantics | existing settlement contracts/tests/evidence | `forge test`, historical workflows | `TESTED_TESTNET` historical | not rerun live |
