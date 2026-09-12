# CLEARA NARRATIVE / DEMO / FRONTEND / REPOSITORY RECONCILIATION

**Date:** 2026-09-11
**Repository:** `etvjay/Cleara`
**Working tree:** local changes present, not committed
**HEAD:** `c1065cedb2ae62543bb253d0bad9af23ffd99261`
**Branch:** `main`, aligned with `origin/main`

## A. Current narrative truth

Cleara is an evidence-backed multichain financial execution, financing, and clearing coordination system. Its strongest precise definition is:

> Cleara makes financial relationships coherent across domains.

Creditcoin CC3 anchors canonical financial coordination and financial state. Source domains execute native economic actions. Attestcoin proves relevant external facts and settlement inclusion. Cleara/Nomos supplies financial interpretation, lifecycle, authority, accounting, clearing coordination, residual derivation, and reconciliation without becoming a second canonical ledger.

Economic payoff:

> Clear first. Move only what remains.

## B. Current product definition

The product is an institutional financial relationship workbench, not a generic dashboard, bridge, wallet, custody system, lending marketplace, explorer, graph toy, or universal settlement network.

The current reference workflow is:

```text
source-domain action
→ Attestcoin evidence
→ verified external fact
→ financial interpretation
→ Creditcoin canonical state
→ facility / commitment / obligation relationship
→ authorized bilateral clearing
→ residual
→ native settlement
→ settlement proof
→ Creditcoin reconciliation
```

The first demonstrated workflow is clear-before-settlement for a facility-linked obligation relationship. It is a reference workflow, not the complete protocol definition.

## C. Current Slice A capability

Slice A is verified within declared limits:

- Modular Creditcoin contracts implement and test claims, financeability, encumbrance, financing, commitments, capitalization, obligations, bilateral clearing, residual routing, settlement, and lifecycle.
- M3-M11 and M11-Lifecycle have separate historical testnet evidence.
- The local workbench contains one deterministic shared composite case graph.
- The workbench has provider, sponsor/debtor, and operator/auditor views, evidence panels, accounting, and controlled pending/mismatch/stale/reorg examples.
- The projection worker is a deterministic local core for commitment, allocation, facility, evidence, lifecycle, accounting, finality, and reorg behavior.
- Nomos is now represented by `@cleara/nomos` as a local semantic/interface boundary over existing contracts.

Slice A does not include a production indexer, durable API, hosted frontend, continuous M3-M11 execution, live UI writes, or production settlement.

## D. Current frontend structure

`apps/web/` is a static, read-only workbench:

- `src/case.ts` seeds the shared fixture and validates settlement semantics.
- `src/browser.ts` renders the role views, work queue, accounting vector, timeline, evidence, capabilities, and investigation states.
- `scripts/serve.mjs`, `build.mjs`, `smoke.mjs`, and `scan-submission.mjs` provide local runtime gates.
- The frontend consumes `@cleara/nomos` for derived relationship composition and labels that result as projection state.

There is no application API, durable server-side read model, browser automation result, or hosted deployment.

## E. Current repository structure

Canonical protocol state is under `contracts/creditcoin/`. Source execution contracts are under `contracts/source/`. The projection core is under `workers/multichain-execution/`. The workbench is under `apps/web/`. Evidence is under `evidence/runtime/` and indexed by `docs/submission/evidence-manifest.json`.

The existing `contracts/creditcoin/kernel/` directory contains only claim and encumbrance contracts. It is a historical source-layout name, not the complete Nomos Kernel.

## F. Current evidence structure

Historical evidence is separated by milestone and workflow. Known references include:

- M11 settlement: workflow `33614782209`, artifact `9841386218`.
- M11-Lifecycle: workflow `33699324988`, artifact `9873864767`.
- M3-M10 evidence documents in `evidence/runtime/` and `GROUND_TRUTH.md`.
- Current combined workbench: `COMPOSITE_FIXTURE`.
- Local projection: `IMPLEMENTED_LOCAL`.

No continuous M3-M11 live execution is claimed.

## G. Current M3-M11 status

| Slice | Status | Boundary |
|---|---|---|
| M3 claim ingestion | `TESTED_TESTNET` | separate live evidence |
| M4 financeability/encumbrance | `TESTED_TESTNET` | separate live evidence |
| M5 facility/allocation | `TESTED_TESTNET` | separate live evidence |
| M6 capital commitment | `TESTED_TESTNET` | source and coordination evidence |
| M7 capitalization | `TESTED_TESTNET` | capitalization seal evidence |
| M8 obligations | `TESTED_TESTNET` | finalized obligation evidence |
| M9 bilateral clearing | `TESTED_TESTNET` | protected, unchanged by Slice B |
| M10 residual/routing | `TESTED_TESTNET` | routed is not settled |
| M11 settlement/reconciliation | `TESTED_TESTNET` | protected, unchanged by Slice B |
| M11-Lifecycle | `TESTED_TESTNET` | separate consumed/expired evidence |
| Projection core | `IMPLEMENTED_LOCAL` | no live indexer claim |
| Workbench | `IMPLEMENTED_LOCAL` | read-only composite fixture |

## H. Conflicts with the assignment

1. The master directive asks for Slice B as a whole-system release, but the repository currently has no API, durable checkpoint store, or production worker runtime. These will be implemented as local deterministic infrastructure and labeled `IMPLEMENTED_LOCAL`, not production.
2. Existing product documentation still presents clear-before-settlement as the primary product decision and labels it proposed. Slice B must preserve the workflow while reframing it as the first demonstrated/reference workflow rather than the whole protocol thesis.
3. Existing `docs/development/INDEXED_READ_MODEL.md` explicitly limits the projection core to lifecycle/financing/evidence events. Slice B must extend it without claiming current live ingestion.
4. The prompt requests browser and hosted gates. Chromium and hosted deployment are unavailable or unverified, so those remain `BROWSER_VERIFICATION_BLOCKED` and `NOT_VERIFIED`.
5. The current worktree contains unrelated untracked Arbitrum candidate files. They are preserved and excluded from Slice B scope.

## I. Claims that exceed current evidence

Not currently supportable:

- production indexer or durable production evidence worker;
- continuous end-to-end M3-M11 execution;
- full ACTUS or FINOS CDM integration;
- vLEI or institutional identity integration;
- live multilateral clearing;
- M12/M13/M14 execution;
- hosted deployment or browser PASS;
- arbitrary supported multichain execution;
- production SLA, compliance, custody, or mainnet claims.

## J. Strong parts that must remain unchanged

- Creditcoin canonical ownership and contract authority model.
- Attestcoin evidence boundary.
- M9 bilateral clearing semantics and tests.
- M11 settlement and reconciliation semantics and tests.
- Existing evidence identifiers and historical evidence files.
- `COMPOSITE_FIXTURE` labeling.
- Exact accounting vector: `460000`, `120000`, `340000`.
- Existing projection invariants and fail-closed settlement validation.
- No wallet, secret, signer, RPC write, funds movement, or live workflow dispatch.

## K. Missing Slice B prerequisites

- Multi-axis observation/finality/evidence/canonical/projection/reconciliation status model.
- Stable observation, checkpoint, reconciliation, provenance, and graph records.
- Deterministic event identity and replay fold beyond the current lifecycle-only model.
- Durable/reproducible checkpoint and reorg recovery behavior.
- Read-only relationship/provenance/investigation API boundary.
- A controlled local demo command for happy, pending-proof, mismatch, reorg, and replay paths.
- Traceability and Slice B evidence artifacts.

## L. Exact files to change

Primary Slice B paths:

```text
workers/multichain-execution/src/
workers/multichain-execution/test/
scripts/slice-b/
docs/development/
docs/architecture/
docs/submission/
apps/web/src/
apps/web/test/
package.json
.github/workflows/
README.md
```

New files must be limited to real Slice B artifacts. Existing contracts and historical evidence files are not implementation targets.

## M. Exact files not to change

```text
contracts/creditcoin/clearing/ClearingEngine.sol
contracts/creditcoin/clearing/ClearingPolicyRegistry.sol
contracts/creditcoin/settlement/ResidualLedger.sol
contracts/creditcoin/settlement/SettlementRouter.sol
contracts/creditcoin/settlement/SettlementReconciler.sol
contracts/creditcoin/obligations/ObligationLedger.sol
contracts/source/settlement/SettlementAdapter.sol
evidence/runtime/*
docs/canonical/GROUND_TRUTH.md
```

Historical evidence and deployed/tested Solidity semantics are protected. Documentation changes must link and clarify, not rewrite historical truth.

## N. Proposed Slice B implementation

Implement a local deterministic read-model package inside the existing worker boundary:

1. Observation envelope with stable source-event identity, normalized payload, evidence mode, and provenance.
2. Separate status axes for observation, finality, evidence, canonical state, projection, reconciliation, and operations.
3. Checkpoint model with parent/block hashes, finality policy, adapter/schema versions, and replay cursor.
4. Idempotent fold with duplicate detection, malformed/conflict records, finality promotion, and reorg rewind/replay.
5. Derived relationship graph with versioned nodes, edges, provenance, and deterministic hash.
6. Reconciliation composition that never promotes projection state over Creditcoin state.
7. Read-only local API adapter over the deterministic snapshot.
8. Demo scenarios and machine-readable evidence/traceability documents.
9. Frontend integration only after the read model is stable, preserving the existing relationship-first workbench.

## O. Proposed Slice B demo

Use one relationship and the existing economic vector. The demo must show:

1. Happy path from source observation through evidence, Creditcoin read, projection, residual, settlement, and reconciliation.
2. Pending proof with blocked reconciliation and explicit operator recovery.
3. Mismatch showing both source and canonical values without silent selection.
4. Reorg showing orphan retention, rewind, replay, and current-state recomputation.
5. Restart/replay showing deterministic, duplicate-free output.

All local scenarios are `IMPLEMENTED_LOCAL`, `LOCAL_PROJECTION`, or `FIXTURE_FROM_LIVE_EVIDENCE` as appropriate.

## P. Proposed Slice B frontend behavior

Keep relationship-first navigation and the existing casebook. Add progressive disclosure for:

- current financial meaning;
- authority and canonical state;
- source observation/finality;
- Attestcoin evidence;
- provenance and graph context;
- projection/reconciliation state;
- owner and next permitted action.

Do not add writes, wallets, graph-first navigation, unsupported chain badges, or M12 mutation controls.

## Q. Proposed Slice B evidence

Add local evidence records for:

- deterministic observation fold;
- duplicate/replay equivalence;
- pending proof;
- source/canonical mismatch;
- reorg recovery;
- restart from checkpoint;
- graph determinism;
- API read-only behavior.

Historical M3-M11 evidence remains referenced, not regenerated or rewritten.

## R. Test and CI plan

Local gates:

```text
pnpm install --frozen-lockfile
pnpm nomos:check
pnpm check:projection
pnpm web:check
forge fmt --check
forge build
forge test
```

Slice B adds worker/read-model/replay/API tests and a dedicated local command. CI should run local checks on relevant paths. Live workflows remain separate and are not dispatched for Slice B.

## S. Deployment and browser plan

Local static/API behavior will be reproducible. No hosted deployment is claimed. Browser status remains `BROWSER_VERIFICATION_BLOCKED` if Chromium is unavailable. Raw HTTP smoke is not browser verification.

## T. Risks and blockers

- Durable production persistence is out of scope and must not be implied by local checkpoint files.
- External proof/provider outages cannot be converted into fixture success.
- Current web server is static, so API integration must remain a bounded local adapter unless a real service boundary is added.
- Existing uncommitted Nomos changes and unrelated Arbitrum files require careful staging and must not be overwritten.
- Node runtime is `22.23.2` locally versus declared `24.19.0`.

No hard blocker prevents local Slice B implementation. The external deployment/browser limitations are bounded and will remain explicitly labeled.

## U. First implementation commit boundary

The first Slice B boundary should contain only:

- reconciliation artifact;
- observation/status/checkpoint/provenance/graph/replay modules;
- focused unit/property/replay/reorg tests;
- local demo command and evidence manifest;
- architecture/development documentation;
- CI paths for local validation.

Frontend/API expansion follows only after this boundary passes. No contract, wallet, RPC write, live workflow, deployment, or M12 mutation belongs in the first boundary.
