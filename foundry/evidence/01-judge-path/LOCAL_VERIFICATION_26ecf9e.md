# Local verification receipt: judge-path reconciliation

Evidence state: VERIFIED_LOCAL
Candidate source heads:
- contract/runner: 26ecf9e2062eaa22d5c35932ac2a1b51468a6074
- UI: f227e5d23494f79e4e5a62a79171f286720a0a28
Base: origin/main c1065cedb2ae62543bb253d0bad9af23ffd99261
Working branch: reconcile/cleara-judge-path

Commands and results on the clean candidate:
- `pnpm install --ignore-scripts --frozen-lockfile`: PASS; lockfile unchanged.
- `scripts/check-foundry`: PASS (4 gaps, 4 claims, phase 01-judge-path-integration).
- `git diff --check`: PASS.
- `forge test`: PASS, 113 passed, 0 failed, 0 skipped, 26 suites.
- runner TypeScript check: PASS (`scripts/live/m11-settlement.ts`).
- `pnpm web:check`: PASS; web typecheck PASS; web tests 17 passed, 0 failed; build PASS; smoke PASS; submission scan PASS (26 files).
- canonical static server route check: PASS, `/try`, `/try/replay`, `/try/live`, `/try/solo`, `/try/claim`, `/try/multi-party/new` all HTTP 200.

Runtime limitation: Node v22.23.2 is active while the repository declares `>=24.19.0 <25`; runtime parity is NOT_VERIFIED. pnpm install used `--ignore-scripts --frozen-lockfile` and emitted only the engine warning.

Scope reconciliation:
- Included: canonical `apps/web`, bounded SettlementAdapterV2/SettlementASCV2 contracts and focused tests, m11 runner, root control plane, and report-only external intake.
- Excluded: workers/slice-c, workers/slice-d, source-scope additions, generic ledger, unrelated workflows/docs, Worker/indexer/D1/proof-worker/bridge/mainnet infrastructure, and legacy judge-session files.
- External writes: none.
- Evidence ceiling: local `TESTED` / `INTEGRATED` candidate evidence. External run remains `PARTIAL` and `REPORT_ONLY`.
