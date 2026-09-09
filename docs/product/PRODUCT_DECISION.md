# Cleara Product Decision

Status: `PROPOSED — NOT YET CANONICAL`

## Decision

Cleara's primary product use case is:

> **Clear-before-settlement for a finalized facility obligation pair.**
>
> A facility sponsor and counterparty use Cleara to reduce authorized reciprocal obligations before native settlement, then prove and reconcile only the residual movement across source-chain execution, Attestcoin evidence, and Creditcoin canonical state.

The product relationship is not “a dashboard,” “multichain financing,” or “capital coordination.” It is an authorized obligation-to-residual settlement relationship.

## Primary users

- **Primary user:** facility sponsor / treasury operator responsible for settling a finalized obligation pair.
- **Counterparty:** reciprocal creditor or debtor whose obligation is included in the bilateral clearing authorization.
- **Capital provider:** upstream participant whose commitment supports the facility and whose lifecycle must remain visible.
- **Protocol operator:** handles pending, mismatch, stale, and reorg cases without becoming financial authority.
- **Auditor:** verifies evidence, authority, accounting, and reconciliation after the fact.

## Why this deserves to exist

The user is not trying to see a chart. They are trying to answer and act on a high-consequence question:

> Given finalized obligations and separately executed source-chain actions, what amount is actually authorized and still needs to move, and can I prove that the resulting residual settled and reconciled?

The failure cost is unnecessary gross movement, ambiguous settlement status, unrecognized source commitments, duplicated action, and an audit trail that cannot connect source receipts to canonical financial state.

## Why Cleara is technically necessary

Cleara coordinates facts whose authorities are deliberately split:

- source chains execute native actions;
- Attestcoin proves inclusion and continuity;
- Creditcoin CC3 owns canonical coordination and financial state;
- Cleara/Nomos supplies financial meaning, authority checks, lifecycle rules, accounting, and reconciliation.

No one ordinary backend can replace those authority boundaries without becoming a new untrusted financial authority. A bridge can move assets but does not clear reciprocal obligations. An ERP can store a result but cannot independently verify native source execution. A custodian can control funds but does not prove the cross-domain relationship. Cleara is necessary only where those boundaries must be coordinated without collapsing them.

## Evidence support

`VERIFIED_REMOTE` is not claimed for the current unpushed tree. Existing repository evidence supports the product hypothesis as follows:

- `TESTED_TESTNET`: M8 finalized obligations — run `33280253700`, artifact `9722789518`.
- `TESTED_TESTNET`: M9 authorized bilateral clearing — run `33280768286`, artifact `9722957475`.
- `TESTED_TESTNET`: M10 residual routing — run `33311029527`, artifact `9731999552`.
- `TESTED_TESTNET`: M11 settlement/proof/reconciliation — run `33614782209`, artifact `9841386218`.
- `TESTED_TESTNET`: M11-Lifecycle — run `33699324988`, artifact `9873864767`.
- `IMPLEMENTED_LOCAL`: projection core and provisional workbench.

M7–M10, M11, and M11-Lifecycle are separate runs. The demo must use `COMPOSITE_FIXTURE` if it combines them.

## What is fixture-only

- One combined case spanning M3 through lifecycle terminal state.
- A single UI relationship joining separate evidence runs.
- Operator pending/stale/reorg examples in the local fixture.
- A complete read-model record containing fields not all present in one live artifact.

## Deferred

- production indexer and durable backfill;
- production API and frontend;
- live UI writes;
- production-value settlement;
- Attestcoin writability;
- mainnet and unsupported chain adapters;
- custody, KYC/KYB/AML, sanctions, ERP/GL, legal enforceability;
- autonomous credit decisions.

## Frontend consequence

Do not build more frontend screens until this decision is accepted and the workflow/domain/state documents are reviewed. The current `apps/web` may be retained as a provisional read-only research harness, but it must not be treated as the product definition.

If accepted, the first product surface should be one obligation relationship and its residual settlement casebook—not a generic dashboard. It should show authority, evidence, accounting, blocked states, and the exact next permitted action.

## Recommended implementation sequence

1. Accept or reject this product decision.
2. Freeze the obligation-relationship domain model, authority matrix, and state machine.
3. Define the continuous evidence manifest and source-finality policy.
4. Define the read-only API/read-model contract for one relationship.
5. Add deterministic fixture and projection tests for happy path, pending, mismatch, stale, reorg, replay, and accounting conservation.
6. Refactor the provisional workbench around one sponsor obligation case only; retain provider and operator views as linked modes.
7. Add browser/runtime verification and an exportable settlement evidence receipt.
8. Implement continuous testnet indexing/evidence gates before any live-write or production claim.

## Minimal data model

```text
ObligationRelationship
  relationshipId: off-chain grouping key
  facilityId: Creditcoin identity
  obligationIds: Creditcoin identities
  parties: authorized principals
  asset/domain: canonical asset identity
  grossAmount / clearedAmount / residualAmount
  clearingAuthorization
  route
  sourceReceipt
  finalityObservation
  attestcoinEvidence
  creditcoinState
  reconciliation
  lifecycleState
  evidenceMode / evidenceLevel
  authority / nextPermittedAction
```

The model must preserve source receipt, proof, canonical state, and projection as separate records. It must not create a synthetic “settled” field without satisfying the settlement invariant.

## API/read-model boundary

The future API should expose a relationship read model and investigation feed only:

- `GET /relationships/:id` — canonical identifiers plus derived evidence links;
- `GET /relationships/:id/states` — ordered state transitions with authority and evidence;
- `GET /relationships/:id/investigations` — pending/mismatch/stale/reorg items;
- `GET /relationships/:id/receipt` — exportable evidence-bound outcome;
- `POST`/writes are not part of the first product slice.

The indexer/worker observes source and Creditcoin events, applies finality and reorg policy, and produces projections. It cannot authorize clearing, settlement, or reconciliation.

## Required frontend surfaces after acceptance

- one obligation relationship entry point;
- sponsor work queue with exact next action;
- obligation/clearing/residual detail;
- evidence and authority panel;
- pending/mismatch/stale/reorg investigation view;
- linked capital-provider commitment lifecycle;
- capability matrix for CC3, Sepolia, Attestcoin, Mainnet readability, and unsupported domains;
- exportable reconciled settlement receipt.

No generic KPI dashboard, portfolio chart, consumer wallet, universal bridge surface, or live UI write control is required for the first slice.

## Test plan

- state transition legality and authority tests;
- clearing conservation `460000 - 120000 = 340000`;
- exact party/token/domain/amount settlement matching;
- no settled state without proof, canonical agreement, and reconciliation;
- pending source/proof, mismatch, stale, reorg, rejection, replay, and duplicate tests;
- projection determinism and read-model/canonical separation;
- evidence manifest schema and provenance tests;
- browser interaction, accessibility, and responsive runtime tests after product acceptance.

## Evidence plan

- retain M8–M11 separate evidence references;
- require source receipt plus independent finality read;
- require Attestcoin evidence acceptance/consumption;
- require Creditcoin canonical state and reconciliation read;
- label local combined demos `COMPOSITE_FIXTURE`;
- promote to a continuous testnet slice only after a single run covers the selected relationship end-to-end;
- do not promote local or fixture evidence to production claims.

## Exact blockers

- product owner acceptance of clear-before-settlement as primary;
- confirmed sponsor/treasury persona and operating context;
- accepted role/identity/session model;
- accepted source-finality and proof-latency policy;
- continuous evidence/indexer design;
- operational ownership for mismatch, stale, and reorg recovery;
- browser/runtime and remote workflow verification after implementation refactor.
