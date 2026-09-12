# CLEARA NARRATIVE / DEMO / FRONTEND / REPOSITORY RECONCILIATION

**Purpose:** Slice B repair and independent-verification scope lock.
**Repository:** `etvjay/Cleara`
**Branch:** `verification/slice-b`
**Base:** `c1065cedb2ae62543bb253d0bad9af23ffd99261`
**Repair implementation:** `82c27b068de9d01be0ee48ec40ed62b1f682f87a`
**Final pushed implementation SHA:** `82c27b068de9d01be0ee48ec40ed62b1f682f87a`
**Verification status:** final implementation and exact-head PR CI pass on `82c27b068de9d01be0ee48ec40ed62b1f682f87a`; browser and hosted deployment remain unverified.

## A. Current narrative truth

Cleara makes financial relationships coherent across domains.

Creditcoin CC3 anchors canonical coordination and financial state. Source domains execute native economic actions. Attestcoin proves relevant external facts. Cleara interprets evidence, coordinates facilities, commitments, obligations, clearing, residual settlement, reconciliation, and lifecycle without becoming a second canonical ledger.

The economic payoff is:

> Clear first. Move only what remains.

## B. Current product definition

Cleara is an institutional financial relationship workbench and evidence system. It is not a generic dashboard, bridge, wallet, custody system, lending marketplace, explorer, graph toy, or universal settlement network.

The first demonstrated workflow is clear-before-settlement for a facility-linked obligation relationship. It is a reference workflow, not the entire protocol definition.

## C. Slice A capability

Slice A is bounded and locally verified:

- modular Creditcoin contracts cover claims through settlement and lifecycle;
- historical M3-M11 and M11-Lifecycle evidence is segmented by run;
- the workbench uses a shared `COMPOSITE_FIXTURE` case;
- the projection core is local and read-only;
- M9 and M11 semantics are protected and unchanged.

No continuous M3-M11 execution, production indexer, hosted deployment, live UI write path, or production settlement claim exists.

## D. Slice B capability

Slice B now provides:

- normalized observation envelopes;
- stable source-event identity;
- separate observation, finality, evidence, canonical, projection, and reconciliation states;
- explicit reorg detection;
- explicit replay with trusted canonical block-header continuity, target-block identity, sparse-event cursor semantics, narrow fail-closed handling for later affected blocks, finality monotonicity, provenance, and idempotency checks;
- globally unique evidence IDs with explicit conflict investigations that preserve the original record;
- relationship-scoped evidence, canonical, replay, dead-letter, object, and investigation reads;
- current reconciliation state separated from append-only reconciliation history;
- deterministic recursively canonical snapshots and hashes with backward-compatible field-aware restore;
- a narrow derived relationship projection;
- assertion-backed demo scenarios;
- a local read-only API.

## E. Frontend boundary

The workbench remains a static, read-only Slice A fixture-backed casebook with an added Slice B state-and-evidence disclosure panel. It is not claimed to be a live Slice B API client. The API and frontend are both read-only and are not authority.

## F. Evidence boundary

Historical live evidence remains separate:

- M11 settlement: workflow `33614782209`, artifact `9841386218`;
- M11-Lifecycle: workflow `33699324988`, artifact `9873864767`;
- M3-M10: repository runtime evidence and manifest records.

Slice B local state is `IMPLEMENTED_LOCAL` / `LOCAL_PROJECTION`. No live proof request or chain write is part of this repair.

## G. Protected areas

The following remain unchanged:

```text
contracts/creditcoin/clearing/*
contracts/creditcoin/settlement/*
contracts/creditcoin/obligations/ObligationLedger.sol
contracts/source/settlement/SettlementAdapter.sol
evidence/runtime/*
docs/canonical/GROUND_TRUTH.md
```

No Nomos package, Nomos contract, Arbitrum file, new chain adapter, wallet, bridge, or live workflow was added.

## H. Required repair outcomes

The repair is accepted only if:

1. finality cannot clear `REPLAY_REQUIRED` or regress during replay;
2. explicit replay succeeds only after target-header continuity and finality checks;
3. replay is idempotent and preserves superseded history;
4. evidence lookup returns known records and conflicting evidence preserves the original;
5. relationship responses cannot leak other relationship records, including scoped object reads;
6. current reconciliation state is separate from reconciliation history;
7. equivalent insertion order produces equal hashes and collision boundaries remain distinct;
8. the demo exits nonzero on failed assertions;
9. read-only API behavior remains enforced;
10. exact repair SHA passes pull-request CI.

## I. Documentation status rules

Nomos remains a conceptual financial-semantics/interface boundary in this branch. No `@cleara/nomos` package is claimed here.

Use:

```text
TESTED_TESTNET              historical protocol evidence
FIXTURE_FROM_LIVE_EVIDENCE  local fixture derived from evidence
COMPOSITE_FIXTURE            combined Slice A workbench case
IMPLEMENTED_LOCAL            local Slice B code and tests
LOCAL_PROJECTION             derived read-model output
NOT_VERIFIED                 browser/deployment until independently verified
DEFERRED                     production persistence, live indexing, M12+
```

## J. Exact verification route

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm check:projection
corepack pnpm web:check
node --import tsx scripts/slice-b/demo.ts
forge fmt --check
forge build --sizes
forge test -vvv
git diff --check
```

Then run the local API smoke and verify pull-request workflows on the exact pushed repair SHA.
