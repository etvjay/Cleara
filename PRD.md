# Cleara Product and Judge-Path Brief

**Status:** `PROVISIONAL / BOUNDED INTEGRATION CANDIDATE`

This file defines the admitted scope for the current integration candidate. It does not ratify the broader product decision in [`docs/product/PRODUCT_DECISION.md`](docs/product/PRODUCT_DECISION.md), which remains `PROPOSED / NOT YET CANONICAL`.

## Objective

Present one legible Cleara path from a user-facing Try route through a bounded testnet action and an evidence-backed terminal result, without collapsing source-chain execution, Attestcoin proof, Creditcoin coordination, and UI observation into one authority.

## Admitted scope

- the existing Cleara frontend under `apps/web`;
- canonical `/try/*` routes for Replay, Watch Live, Guided Solo, Claim, and multi-party creation;
- deterministic wallet-free Replay;
- truthful read-only Watch Live;
- one bounded Guided Solo source-chain action on Sepolia;
- `SettlementAdapterV2` one-shot authorization and transfer enforcement;
- `SettlementASCV2` source receipt and evidence validation;
- independent deployment, receipt, finality, runtime, and state readbacks;
- a sanitized, immutable evidence package for each external run.

## Explicit exclusions

- production economic value or mainnet operation;
- a generic Slice E ledger;
- automatic funding or replacement deployments;
- bridges and cross-chain atomicity claims;
- automatic proof/indexing infrastructure;
- Cloudflare Worker, D1, or proof-worker deployment;
- live UI authority beyond the bounded path;
- custody, legal enforceability, KYC/KYB/AML, or production monitoring.

Cloudflare Pages is delivery infrastructure only. Its existence does not promote the application to `LIVE` or `MONITORED`.

## Evidence ceiling

Local code and test evidence may support `IMPLEMENTED` and `TESTED`. A reported external run remains `PARTIAL` until its sanitized packet is retained and independently read back. A deployed contract is not, by itself, a successful workflow. A submitted transaction is not, by itself, finalized business success.

## Exit condition

This candidate may be considered integrated only when the current phase gate passes on one clean exact HEAD, the canonical frontend and bounded contract/runner paths are both exercised, the external evidence packet is retained or the gap is explicitly blocked, and an independent exact-head review has completed.
