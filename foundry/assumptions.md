# Cleara Assumptions

| ID | Assumption | Status | Impact if false | Evidence needed | Resolution |
|---|---|---|---|---|---|
| ASM-001 | The first bounded operator is a facility sponsor or treasury operator. | OPEN | Product entry point may be wrong. | Accepted product decision and user validation. | — |
| ASM-002 | The reciprocal obligation pair is finalized before the bounded Cleara workflow begins. | OPEN | Guided Solo may be authorizing an invalid obligation. | Canonical workflow and authority review. | — |
| ASM-003 | Testnet/mock-token evidence is sufficient for the judge path but not for production economic claims. | RESOLVED | A demo could be overclaimed as economic proof. | `foundry/evidence/01-judge-path/REPORTED_EXTERNAL_RUN.md` plus explicit limitations. | Keep all public claims testnet/mock-token bounded. |
| ASM-004 | The direct browser-to-Sepolia action does not require a Worker, indexer, D1 database, or proof worker. | RESOLVED | Scope could expand into unnecessary hosted infrastructure. | `PRD.md`, `AGENTS.md`, and bounded runner/UI path. | Keep automatic proof and persistent projection as future scope. |
| ASM-005 | The current UI candidate is the canonical Cleara frontend for the bounded Try surface. | OPEN | UI integration could target the wrong product surface. | Exact-head UI runtime checks and product-owner confirmation. | — |
| ASM-006 | Source finality and proof-latency policy are not yet canonical for a production workflow. | OPEN | Live recovery and SLA claims may be invalid. | Accepted operations policy and live evidence. | — |
