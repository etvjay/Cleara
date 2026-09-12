# Cleara demo

Cleara makes financial relationships coherent across domains.

## Slice A reference workflow

The existing workbench demonstrates the composite facility relationship:

```text
460000 gross obligations
→ 120000 movement cleared
→ 340000 residual
→ native settlement
→ Attestcoin evidence
→ Creditcoin reconciliation
```

Evidence mode: `COMPOSITE_FIXTURE`. M3-M11 and M11-Lifecycle are separate testnet evidence runs.

```bash
pnpm web:check
pnpm web:dev
```

## Slice B local read-model demo

Slice B makes the relationship inspectable and recoverable without replacing Creditcoin or Attestcoin.

```bash
pnpm slice-b:demo
pnpm slice-b:dev
```

Local API routes:

```text
GET /health
GET /relationships/relationship:slice-b:fixture
GET /relationships/relationship:slice-b:fixture/timeline
GET /relationships/relationship:slice-b:fixture/graph
GET /facilities/:id, /commitments/:id, /obligations/:id, /settlements/:id, /evidence/:id
GET /reconciliation/exceptions?relationshipId=:id
GET /investigations?relationshipId=:id
GET /checkpoints
GET /snapshots/relationship:slice-b:fixture
```

The demo emits six assertion-backed local scenarios:

- happy path;
- pending proof;
- source/canonical mismatch;
- reorg detection followed by explicit replay;
- relationship scope isolation;
- deterministic hash equivalence and change detection.

Evidence mode: `IMPLEMENTED_LOCAL` and `LOCAL_PROJECTION`. No route mutates canonical state.

## Limitations

The local API is deterministic and in-memory. It is not a production indexer, durable worker, proof-submission service, settlement executor, or hosted deployment. Browser verification is separate from HTTP smoke and remains `NOT_VERIFIED` if Chromium is unavailable.
