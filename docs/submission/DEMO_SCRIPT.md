# Cleara Demo Script

## Setup

```bash
pnpm install --frozen-lockfile
pnpm web:check
pnpm web:dev
```

Open the printed local URL. No wallet connection and no secrets are required.

## Opening statement

Cleara is an institutional workbench for tracing capital commitments, obligations, clearing, settlement, and lifecycle evidence across source chains and Creditcoin CC3.

This case is labeled `COMPOSITE_FIXTURE`: it combines separately evidenced testnet runs and is not one uninterrupted M3→M11 execution.

## Scene 1: capital provider

1. Select **Capital provider**.
2. Open the **Provider commitments** stage.
3. Show:
   - source commitment context;
   - M7 capitalization evidence;
   - M11-Lifecycle evidence;
   - consumed and expired terminal states;
   - gross versus terminal accounting.
4. Explain:

```text
A source commitment is not permanently active merely because it was once proven.
CapitalConsumed and CapitalExpired are later source facts that require their own
Attestcoin proof and Creditcoin lifecycle transition.
```

## Scene 2: facility sponsor / debtor

1. Select **Facility sponsor / debtor**.
2. Open **Obligations**, **Bilateral clearing**, **Economic residual**, and **Native settlement**.
3. Show:
   - 460,000 gross obligations;
   - 60,000 authorized clearing;
   - 340,000 derived residual;
   - route state before settlement;
   - exact payer/recipient/amount proof and final reconciliation.
4. Explain:

```text
Clearing reduces the amount that needs to move. A route is not a settlement.
SETTLED appears only after successful source execution, Attestcoin evidence, and
Creditcoin reconciliation agree.
```

## Scene 3: operator / auditor

1. Select **Operator / auditor**.
2. Inspect the investigation queue:
   - `PENDING_PROOF`;
   - `MISMATCH`;
   - `REORG_DETECTED`.
3. Open a stage and show the evidence panel.
4. Open the capability matrix and point out:
   - Creditcoin canonical coordination;
   - Sepolia source execution;
   - Attestcoin readability;
   - local projection only;
   - unsupported chains.
5. Explain:

```text
The operator does not receive a synthetic health score. They receive a state,
its provenance, its authority boundary, and the next recovery action.
```

## Closing statement

The protocol evidence is testnet-backed. The workbench is a local read-only submission surface. The production indexer, durable workers, API, custody, compliance, and mainnet operation remain deferred.
