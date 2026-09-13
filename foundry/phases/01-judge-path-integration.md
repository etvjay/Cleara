# Phase 01: Judge-Path Integration

**Status:** `IN_PROGRESS`

**Owner:** Cleara integration owner

## Objective

Reconcile the contract/runner candidate and canonical frontend candidate into one legible Cleara monorepo without broadening the bounded judge path.

## Admitted scope

- `contracts/source/settlement/SettlementAdapterV2.sol`
- `contracts/creditcoin/gateway/SettlementASCV2.sol`
- `scripts/live/m11-settlement.ts`
- focused settlement tests and evidence validators;
- the canonical `/try/*` frontend route and wallet surface;
- repository control-plane files under `foundry/`;
- sanitized report-only or independently read-back evidence.

## Explicitly excluded

- generic Slice E ledger work;
- automatic funding, replacement deployments, retries, bridges, mainnet, and production value;
- Worker, indexer, D1, proof-worker, or other cloud infrastructure;
- changes to unrelated product surfaces;
- push, publication, or merge into `main`.

## Preconditions

- `origin/main` is the integration base;
- candidate heads are frozen and clean;
- the protected runner process has completed;
- no credentials enter the worktree or evidence;
- the canonical frontend remains `/tmp/cleara-ui` at the stated UI candidate head.

## Invariants

- A settlement obligation can produce at most one value-moving source execution.
- Exact token, amount, caller, target, call data, receipt, log, chain, and evidence identities remain bound.
- Source execution, proof, CC3 state, reconciliation, and UI observation remain distinct claims.
- Testnet/mock-token evidence is never presented as production economic proof.
- A live claim requires external evidence and independent readback.

## Required verification

- `scripts/check-foundry`;
- `git diff --check`;
- Forge full suite;
- runner TypeScript check;
- `pnpm web:check`;
- canonical route smoke and static route checks;
- exact staged-path and secret scan.

## Live verification

**Required:** YES for `LIVE_DEMONSTRATED` claims, NO for local structure acceptance.

**Target:** Sepolia source contracts, CC3 coordination contracts, Attestcoin evidence, and Cloudflare Pages delivery where claimed.

**Success condition:** exact deployment/runtime/receipt/finality/state/UI identity readbacks are retained and bound to the final candidate.

## Evidence required

- exact integration HEAD and clean worktree;
- candidate source HEADs and ancestry record;
- local test outputs from the integration HEAD;
- sanitized live manifest;
- deployment addresses and transaction/block identities;
- runtime bytecode and constructor/state readbacks;
- final proof and reconciliation readbacks;
- truthful UI deployment identity;
- unresolved gap and contradiction dispositions.

## Exit gate

The phase is `PASS` only when:

1. the control plane passes its consistency check;
2. the contract, runner, and UI gates pass on one clean integration HEAD;
3. the canonical UI is the only active judge surface;
4. no admitted critical gap remains;
5. every external claim is either independently evidenced or explicitly `PARTIAL`/`BLOCKED_EXTERNAL`;
6. one fresh exact-head review passes;
7. publication or merge is separately authorized.

## Stop conditions

Stop if:

- candidate files conflict with the canonical UI contract;
- live evidence cannot be independently read back;
- a product or authority contradiction changes the admitted scope;
- an external side effect requires new authorization;
- a check reveals a security regression.

## Known non-goals

This phase does not make Cleara production-ready, audited, mainnet-deployed, economically authentic, continuously indexed, or monitored.
