# Cleara Status

**Repository state:** `INTEGRATION_CANDIDATE`

**Integration branch:** `reconcile/cleara-judge-path`

**Base:** `origin/main` at `c1065cedb2ae62543bb253d0bad9af23ffd99261`

**Candidate inputs:**

- Contract and runner: `verification/slice-e-judge-path` at `26ecf9e2062eaa22d5c35932ac2a1b51468a6074`.
- Canonical UI: `ui/slice-b-casebook` at `f227e5d23494f79e4e5a62a79171f286720a0a28`.

This is a path-selective local candidate created directly from `origin/main`. It is unpushed and has not passed the clean-candidate verification gates yet.

## Surface map

| Surface | Location | Current state |
|---|---|---|
| Product UI | `apps/web` | Canonical Try route candidate |
| Sepolia source action | `contracts/source/settlement` | Bounded testnet implementation |
| CC3 coordination/evidence | `contracts/creditcoin/gateway` | Bounded settlement evidence implementation |
| Live runner | `scripts/live/m11-settlement.ts` | Bounded runner candidate |
| Contract tests | `test/settlement` | Focused candidate tests |
| Governance | `BUILD_FOUNDRY.md`, `foundry/` | Required control plane |

## External report status

An operator report states that Sepolia and CC3 testnet writes completed, including 70/70 bounded writes, a final proof-acceptance transaction, and a Cloudflare Pages deployment at `https://cleara-9a8.pages.dev`.

That report is retained as `REPORT_ONLY` under `foundry/evidence/01-judge-path/`. It is not independently read-back evidence for this repository until the exact packet, receipts, runtime code, finality, state, and hosted-source identity are reconciled.

The reported immutable Pages deployment URL had a TLS failure from the execution environment. The stable URL is a separate delivery observation. Neither observation establishes monitoring.

## Current evidence ceiling

- Contract behavior: `IMPLEMENTED`; clean-candidate verification pending.
- UI route behavior: `IMPLEMENTED`; clean-candidate verification pending.
- Testnet workflow: `PARTIAL` report-only evidence.
- Cloudflare Pages: `PARTIAL` report-only delivery evidence, not `LIVE` or `MONITORED` product evidence.
- Production, mainnet, economic authenticity, automatic indexing, and monitoring: not claimed.

## Next gate

Run the required clean-candidate local gates, record exact counts and the final integration head, then obtain one separately authorized exact-head review. Do not push or merge into `main` as part of this phase.
