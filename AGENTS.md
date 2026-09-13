# Agent Directive

This repository is governed by [`BUILD_FOUNDRY.md`](BUILD_FOUNDRY.md).

Before modifying behavior, read in this order:

1. `BUILD_FOUNDRY.md`
2. `PRD.md`
3. `foundry/state.json`
4. the current phase under `foundry/phases/`
5. open gaps under `foundry/gaps.jsonl`
6. affected claims under `foundry/claims.jsonl`
7. assumptions and contradictions
8. the affected implementation and tests

## Current integration boundary

This branch is the local `integration/cleara-judge-path` candidate. It reconciles:

- the contract and runner candidate from `verification/slice-e-judge-path` at `26ecf9e2062eaa22d5c35932ac2a1b51468a6074`;
- the canonical frontend candidate from `ui/slice-b-casebook` at `f227e5d23494f79e4e5a62a79171f286720a0a28`.

The intended product path is the bounded Cleara judge path:

- deterministic wallet-free Replay;
- truthful read-only Watch Live;
- one bounded Guided Solo Sepolia action;
- source-side one-settlement-per-obligation enforcement;
- independent deployment, receipt, finality, and evidence readback.

## Explicit exclusions

Do not add a generic Slice E ledger, automatic funding, retries or replacement deployments, mainnet, bridges, a Cloudflare Worker, an indexer, D1, a proof worker, or a generic transfer builder as part of this phase.

The browser must never receive a private key. Testnet/mock-token evidence must not be described as production value, financial authorization, or cross-chain atomicity.

## Evidence rules

Do not report `PASS` unless the current phase exit gate is satisfied at the exact reported HEAD. Keep implemented, tested, integrated, deployed, live-demonstrated, live, and monitored states separate.

Every newly discovered material defect or unknown becomes a gap or assumption. Every meaningful fix must consider a machine-detectable regression guard.

External writes, pushes, merges to `main`, hosted-resource changes, and credential use require an explicit side-effect decision. A local candidate is not a published release.
