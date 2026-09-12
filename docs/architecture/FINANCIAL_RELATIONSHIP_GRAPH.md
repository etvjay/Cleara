# Financial relationship graph

The Slice B graph is a deterministic derived explanation and investigation projection.

```text
source observation
→ evidence
→ canonical reference
→ relationship objects
→ reconciliation
→ graph snapshot
```

It is not canonical financial state, does not authorize clearing, and cannot mutate Creditcoin.

## Schema

Graph schema version: `slice-b-graph-v1`.

Node types include `Relationship`, `Claim`, `Facility`, `Allocation`, `Commitment`, `Obligation`, `ClearingEpoch`, `Residual`, `Settlement`, `Evidence`, and `ExternalExecution`.

Edges carry type and provenance IDs. The current local builder uses `DERIVED_FROM`, `PROVEN_BY`, `SETTLED_BY`, and `RECONCILES`; the broader protocol vocabulary remains available for future materialized relationships only when supported by evidence.

Every graph has a deterministic `projectionHash`. Nodes and edges are sorted before hashing. Rebuilding the same observation and reconciliation set must produce the same hash.

## Boundary

```text
GRAPH PROJECTION != CANONICAL FINANCIAL STATE
```

Creditcoin state remains authoritative for financial coordination. Source domains remain authoritative for native execution. Attestcoin remains authoritative for external proof. The graph explains relationships among those records.
