# Slice B demo

## Demo claim

Cleara makes one financial relationship inspectable across source observation, Attestcoin evidence, Creditcoin canonical reference, projection, provenance, and reconciliation.

## Evidence mode

The demo is `IMPLEMENTED_LOCAL` and `LOCAL_PROJECTION`. The existing M3-M11 references remain separate historical testnet evidence. No continuous M3-M11 execution is claimed.

## Run

```bash
pnpm install --frozen-lockfile
pnpm slice-b:demo
pnpm slice-b:dev
```

The local API binds to `http://127.0.0.1:4180` by default. Set `SLICE_B_PORT` to use another local port.

## Scenarios

The deterministic demo emits:

1. `happy_path`: finalized source observation, accepted evidence, Creditcoin reference, reconciled relationship, graph, snapshot hash.
2. `pending_proof`: finalized observation with pending Attestcoin evidence, blocked reconciliation, evidence operator ownership, and next action.
3. `mismatch`: source amount and canonical amount differ, with no silent choice.
4. `reorg_and_replay`: invalid parent remains blocked, then a replacement with the trusted predecessor is finalized, replayed, promoted, and safely replayed again as a no-op.
5. `relationship_scope`: records for one relationship cannot leak into another relationship response.
6. `determinism`: equivalent insertion orders hash identically while a meaningful payload change changes the hash.

## HTTP click path

```text
/health
→ /relationships/relationship:slice-b:fixture
→ /relationships/relationship:slice-b:fixture/timeline
→ /relationships/relationship:slice-b:fixture/graph
→ /investigations
→ /checkpoints
→ /snapshots/relationship:slice-b:fixture
```

## What this proves

- stable source-event identity;
- independent status axes;
- duplicate-safe ingestion;
- finality promotion;
- evidence and canonical read separation;
- explicit mismatch ownership;
- reorg detection, trusted-parent validation, and explicit replay;
- populated current checkpoint serialization;
- deterministic graph and snapshot composition;
- read-only API behavior.

## What this does not prove

- production backfill or persistence;
- live provider availability;
- new Attestcoin proofs;
- Creditcoin mutation;
- M12 or multilateral clearing;
- hosted deployment;
- browser verification.
