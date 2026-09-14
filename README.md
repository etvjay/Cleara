# Cleara

**Cleara is a multichain financing and clearing protocol.**

**Financial relationships, coherent across domains.**

Cleara coordinates financing and clearing across execution and coordination domains. Attestcoin / USC establishes verifiable external facts. Cleara determines the permitted financial consequence of those facts. Creditcoin maintains canonical financial coordination state.

> **Clear first. Move only what remains.**

Cleara is designed for facility sponsors, debtors, capital providers, treasury and reconciliation operators, auditors, and authorized observers. It is not a consumer wallet, a custody service, or a generic dashboard.

## The problem

A financing relationship is split across authorities. A source chain can execute a native commitment or token movement. A proof system can establish that a source event was included and remains continuous. A coordination chain can record the financial meaning, authorization, obligation, clearing, and reconciliation state. A read model can make the relationship understandable, but it cannot become financial authority merely by displaying it.

Without these distinctions, a submitted transaction can be mistaken for settlement, a proof can be mistaken for authorization, a balance can be mistaken for committed capital, and a database can be mistaken for canonical state. Cleara coordinates the relationship without collapsing those boundaries.

## How Cleara works

In product terms, Cleara answers a high-consequence question:

> Given finalized obligations and separately executed source-chain actions, what amount is authorized to move, what amount can be cleared first, and can the remaining movement be proven and reconciled?

The relationship follows this path:

```text
SOURCE EXECUTION
  → ATTESTCOIN VERIFICATION / USC
  → FINANCIAL INTERPRETATION
  → CREDITCOIN CANONICAL STATE
  → OBLIGATIONS
  → AUTHORIZED CLEARING
  → RESIDUAL
  → NATIVE SETTLEMENT
  → EXTERNAL PROOF
  → RECONCILIATION
```

In technical terms:

- Source chains execute native commitment and settlement actions.
- Attestcoin / USC provides source-chain readability, inclusion, and continuity evidence.
- Cleara applies relationship, authority, accounting, and lifecycle rules to interpret those facts.
- Creditcoin CC3 owns the canonical coordination and financial-state transitions.
- Finalized reciprocal obligations can be reduced only through explicit clearing authorization.
- The remaining residual is routed for native settlement in its configured source domain.
- SettlementASCV2 validates the exact source receipt and binds it to the Creditcoin route, obligation, representation, and reconciliation state.

Creditcoin and Attestcoin are core architecture, not optional peripheral integrations. Cleara contains Nomos-like financial semantics across its current logic, but this repository does not claim a distinct modular Nomos kernel, generalized Nomos adapters, or ACTUS/CDM integration.

## The economic relationship

**Clear first. Move only what remains.**

The demonstrated testnet/mock-token accounting vector is:

| Measure | Amount | Meaning |
|---|---:|---|
| Gross obligations | 460,000 | Finalized reciprocal obligation value |
| Gross movement cleared | 120,000 | Reduction from the authorized reciprocal clearing operation |
| Residual settlement | 340,000 | Amount remaining after the gross movement reduction |
| Outstanding after reconciliation | 0 | No remaining outstanding amount in the reconciled example |

The 120,000 figure is the gross movement reduction from reciprocal clearing. The 340,000 figure is the remaining residual that settles natively. They are not interchangeable descriptions of one amount. These are test units and evidence vectors, not proof of production economic value.

## Authority model

| Authority or surface | Responsibility | What it cannot claim |
|---|---|---|
| Source execution | Participant wallet signs and submits the native source-chain action | It cannot create Creditcoin state without the required proof and role |
| Attestcoin / USC | Establishes source inclusion, continuity, and evidence coordinates | It does not decide identity, creditworthiness, financial meaning, or authorization |
| Cleara interpretation | Applies relationship semantics, authority checks, accounting, and lifecycle rules | It does not replace the source chain, proof substrate, or Creditcoin authority |
| Creditcoin CC3 | Maintains canonical coordination and financial state | It cannot bypass configured evidence, policy, amount, or terminal-state rules |
| Read model / workbench | Presents provenance, state, uncertainty, and next permitted action | It cannot sign, submit, authorize, or overwrite canonical state |

### Boundary vocabulary

- **`OBSERVED != PROVEN`** — A source observation is not an accepted proof of inclusion or continuity.
- **`PROOF != AUTHORITY`** — Evidence that an event happened does not authorize its financial consequence.
- **`COMPATIBILITY != CLEARING AUTHORITY`** — A domain or adapter being readable or compatible does not permit a clearing transition.
- **`CLEARING != SETTLEMENT`** — Clearing reduces authorized reciprocal obligations; settlement moves the remaining native amount.
- **`ROUTED != SETTLED`** — A residual route instruction does not establish that native settlement completed.
- **`WALLET != PARTY`** — A connected address is an execution identity for a domain, not automatically an organization or cross-chain party.
- **`RELATIONSHIP GRAPH != CANONICAL STATE`** — A composed case graph is a read-model presentation, not a replacement for canonical contract state.

## Lifecycle

Cleara keeps the lifecycle explicit:

```text
claim
  → financeable capacity
  → encumbrance
  → facility
  → allocation
  → provider commitment
  → capitalization
  → finalized obligation
  → explicitly authorized reciprocal clearing
  → residual route
  → native settlement
  → Attestcoin / USC proof
  → Creditcoin reconciliation
  → consumed or expired terminal state
```

Source chains execute native actions. Attestcoin / USC proves the source-chain facts and coordinates evidence. Cleara interprets those facts within the financing relationship. Creditcoin records canonical coordination and financial state. Finalized reciprocal obligations may be cleared only when explicitly authorized. The remaining residual settles natively. The external settlement is proven and reconciled before the relationship becomes `SETTLED`.

### One-shot settlement path

`SettlementAdapterV2` is the bounded source-side settlement control. A configured authority signs an exact EIP-712 authorization containing the obligation, settlement, residual, debtor, creditor, asset class, token, amount, and expiry. The adapter:

- rejects signature or field mutation;
- binds each obligation, settlement, and residual identity once;
- restricts execution to the authorized debtor;
- consumes the authorization before the external token call, with failure reverting the state change;
- requires exact debtor decrease and creditor increase for the token amount; and
- prevents reuse after consumption or cancellation.

`SettlementASCV2` validates the corresponding external evidence. It checks the source domain, proof, successful receipt status, exact receipt shape, source adapter, `Transfer` event, `SettlementExecuted` event, event encoding, payer, recipient, token, amount, route, representation, obligation maturity, and exact `executeSettlement(obligationId)` source call. It also rejects replayed proof queries before reconciling the accepted settlement into Creditcoin state.

A transaction submission is not automatically settlement success. Settlement requires the required receipt, proof, canonical state, and reconciliation agreement.

## Current product surfaces

The canonical frontend uses dedicated routes rather than query-mode navigation:

- `/try` — choose an observation or participation surface.
- `/try/replay` — deterministic, wallet-free replay of a composite fixture.
- `/try/live` — read-only observation of configured Ethereum Sepolia and Creditcoin CC3 heads.
- `/try/solo` — Guided Solo bounded participant interface.
- `/try/claim` — bounded open-role candidate surface.
- `/try/multi-party/new` — bounded invited-role candidate surface.
- `/join/:inviteId` — surrounding invitation route.
- `/session/:sessionId` — surrounding session route.

### Replay

Replay is deterministic and wallet-free. It walks a completed composite fixture assembled from separately evidenced milestones. It is an observation and comprehension surface. It does not submit a transaction, connect a wallet, or turn a projection into canonical financial state. The case identifier is a read-model identifier, not an on-chain authority.

### Watch Live

Watch Live is read-only. It reports reachable configured chain heads and explicitly shows when a shared relationship read model is not indexed. A current block number is observed infrastructure state, not proof that a relationship transition occurred.

### Guided Solo

Guided Solo is an implemented bounded participant interface. It lets one connected source-chain participant perform the bounded Sepolia path:

```text
MockERC20 mint → approve CapitalCommitmentVault → commit
  → CapitalCommitted
```

The browser uses the participant wallet for the source action and does not receive a CC3 private key. Sponsor and counterparty test actors remain explicitly labelled. Guided Solo is not claimed as `E2E_VERIFIED` or `LIVE_DEMONSTRATED` without an independently observed browser-to-chain-to-proof-to-CC3 run.

Claim and multi-party routes are bounded candidate surfaces. Their role intent is local to the browser slice; a shared invite/session service is not claimed as implemented.

## Evidence and current status

Cleara follows the Foundry rule:

```text
implemented ≠ verified
verified locally ≠ proven live
deployed ≠ working
documented ≠ true
```

Current evidence is classified as follows:

- **`TESTED`** — Local contract tests cover the bounded `SettlementAdapterV2` and `SettlementASCV2` semantics.
- **`IMPLEMENTED_LOCAL`** — The projection core and current Try surface exist locally with deterministic/read-only boundaries.
- **`TESTED_TESTNET`** — Historical M2–M11 and M11-Lifecycle slices have separately recorded testnet evidence.
- **`PARTIAL` / `REPORT_ONLY`** — The external 70/70 testnet report is retained as an operator report, not independent evidence for this repository.
- **`PARTIAL` / `REPORT_ONLY`** — Pages or hosted deployment reports are not promoted without independent provider, source-identity, and runtime readback.

The external 70/70 report remains `PARTIAL` / `REPORT_ONLY` until the exact packet, receipts, finality, runtime hashes, constructor bindings, and state readbacks are independently reconciled to this repository. Separate M3–M11 records do not form a continuous uninterrupted live run. A mock-token testnet result is not economic authenticity or production settlement proof.

The current gaps preserve these limitations: the external packet is not independently reconciled, the broader product decision remains provisional, a historical RPC limitation conflicts with a newer operator report, and an immutable Pages URL was not independently TLS-verified in the recorded environment.

## Explicit non-goals and limitations

This repository does not claim:

- multilateral clearing;
- generalized adapter coverage;
- ACTUS or CDM integration;
- a distinct modular Nomos kernel or generalized Nomos adapters;
- mainnet or production operation;
- production settlement or production economic value;
- custody or control of participant funds;
- legal enforceability;
- KYC, KYB, AML, sanctions, Travel Rule, or accounting compliance;
- production monitoring, availability, disaster recovery, or customer SLA;
- a production indexer, API, or durable worker;
- cross-chain atomicity;
- economic authenticity of mock-token evidence;
- one continuous uninterrupted M3-to-M11 live run;
- a production frontend or hosted deployment;
- automatic funding, replacement deployments, bridges, or privileged browser keys.

The compliance boundary is explicit: Attestcoin evidence proves source-chain inclusion and continuity, but does not perform identity, sanctions, credit, legal, or financial authorization. Production promotion would require separate legal/compliance review, smart-contract and threat audits, privacy controls, operational recovery, and evidence against real dependencies.

## Verification

The repository requires Node `>=24.19.0 <25` and pnpm `11.24.0`. Use Node 24.19.0. Do not substitute Node 22 and call the full verification complete.

### Local quick start

```bash
corepack enable
corepack prepare pnpm@11.24.0 --activate
pnpm install --frozen-lockfile
pnpm check:projection
pnpm web:check
```

### Contract and repository gates

```bash
scripts/check-foundry
git diff --check
forge fmt --check
forge build --sizes
forge test -vvv
pnpm exec tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck scripts/live/m11-settlement.ts
```

These commands verify formatting, compilation, local contract behavior, projection behavior, the frontend build/check path, the bounded runner's TypeScript surface, and Foundry claim/gap controls. They do not constitute live deployment, live browser execution, production monitoring, or economic authenticity.

## Documentation map

- [`BUILD_FOUNDRY.md`](BUILD_FOUNDRY.md) — evidence vocabulary, source-of-truth rules, gates, and stop conditions.
- [`PRD.md`](PRD.md) — current bounded product and judge-path scope.
- [`STATUS.md`](STATUS.md) — repository and external-report status; historical candidate references remain classified there.
- [`GROUND_TRUTH.md`](docs/canonical/GROUND_TRUTH.md) — canonical semantic boundaries and milestone evidence.
- [`PRODUCT_DECISION.md`](docs/product/PRODUCT_DECISION.md) — provisional clear-before-settlement product decision.
- [`PRODUCT_THESIS.md`](docs/submission/PRODUCT_THESIS.md) — product thesis and audience.
- [`CLAIMS_AND_LIMITS.md`](docs/submission/CLAIMS_AND_LIMITS.md) — supported claims and explicit limits.
- [`EVIDENCE_INDEX.md`](docs/submission/EVIDENCE_INDEX.md) — separate testnet evidence records and provenance.
- [`REVIEW_RECONCILIATION.md`](docs/submission/REVIEW_RECONCILIATION.md) — local projection and authority reconciliation.
- [`AUTHORITY_MATRIX.md`](docs/development/AUTHORITY_MATRIX.md) — who may observe, authorize, sign, and reconcile.
- [`COMPLIANCE_BOUNDARY.md`](docs/development/COMPLIANCE_BOUNDARY.md) — non-regulated demonstration boundary.
- [`WEBAPP_SURFACE.md`](docs/development/WEBAPP_SURFACE.md) — product surface, domain capabilities, and read-model boundaries.
- [`SettlementAdapterV2.sol`](contracts/source/settlement/SettlementAdapterV2.sol) — bounded one-shot source settlement control.
- [`SettlementASCV2.sol`](contracts/creditcoin/gateway/SettlementASCV2.sol) — exact source receipt and proof binding.
- [`try-app.tsx`](apps/web/src/try-app.tsx) — current Try route and participant behavior.
- [`try-model.ts`](apps/web/src/try-model.ts) — canonical Try route model.
- [`wallet.ts`](apps/web/src/wallet.ts) — public testnet fixture configuration and ABIs; no privileged keys.
- [`m11-settlement.ts`](scripts/live/m11-settlement.ts) — bounded runner implementation; external execution remains separately gated.

The broader product decision is still `PROPOSED / NOT YET CANONICAL`. The current README describes the admitted bounded protocol and product surfaces without promoting that provisional decision, report-only external execution, or hosted deployment into production truth.
