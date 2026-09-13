# Slice D1 Traceability

D1 is intentionally traceable to the D0 manifest, the repository's existing source event definition, and the public B/C boundaries.

| Requirement | Implementation | Verification | Evidence ceiling |
|---|---|---|---|
| Consume D0 as sole scope source | `src/fixture-data.ts`, `src/adapter.ts`, `src/backfill.ts` | `manifest-compatibility.test.ts`, demo | fixture/local only |
| Narrow read-only provider | `src/provider.ts`, `src/fixture-provider.ts` | `fixture-provider.test.ts` | no live provider |
| Exact source identity | `src/adapter.ts` | identity drift and unsafe response tests | local validation |
| CapitalCommitted ABI and selector | D0 event fields build the ABI declaration and decoder | adapter happy/malformed tests | repository ABI basis, no deployment |
| Relationship mapping | D0 `relationshipMappings` only | mapping and ambiguity tests | fixture relationship only |
| Complete observation identity | `NormalizedSourceObservation` | adapter happy-path assertions | projection input, not authority |
| Bounded sparse backfill | `src/backfill.ts` | range, sparse, cursor, overlap tests | no production indexing |
| Receipt and log validation | `src/adapter.ts`, backfill receipt cache | mismatch, missing, malformed tests | fixture provider |
| Monotonic finality | B `advanceFinality` via `src/slice-b-boundary.ts` | finality regression test | fixture two-confirmation policy |
| Reorg detection and replay | B `ingestObservation`, `advanceFinality`, `replayReorg` via serialized boundary | reorg, multi-event, missing-history tests | local B semantics |
| Trusted-header recovery | B `backfillReplayHeader` via serialized boundary | boundary method and B tests | operator-only recovery |
| Serialized B/C integration | `src/slice-b-boundary.ts`, `src/slice-c-boundary.ts` | restart and checkpoint tests | local filesystem durability only |
| Retry and dead letter | C `RetryOrchestrator` through D wrapper | outage, restart, dead-letter, operator replay tests | no hosted worker claim |
| Truthful read-only status | `BackfillResult.statusMarkers`, `status()`, `readApi()` | status assertions and demo | no HTTP surface added |
| Deterministic demo | `scripts/slice-d/demo.ts` | demo and smoke wrapper | local fixture evidence |
| Protected path safety | D1 workflow and local scans | final gate | no contract/evidence-runtime changes |
