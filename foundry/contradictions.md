# Cleara Contradictions

## CLR-CON-003 — Historical live-RPC limitation versus current external-run report

**Status:** `OPEN / CLASSIFIED`

**Source A:** `docs/development/CONTRADICTIONS.md` records that the earlier assistant sandbox could not perform the required arbitrary outbound JSON-RPC calls and that live results needed to come from a networked Cleara runtime.

**Source B:** The current operator report states that the 26ecf9e candidate completed 70/70 Sepolia and CC3 writes and a final proof-acceptance transaction.

**Conflict:** The repository has an older documented environment limitation and a newer reported external execution, but the exact retained packet and independent readbacks are not yet bound to this integration tree.

**Impact:** The external workflow claim remains `PARTIAL`; it cannot promote this candidate to `LIVE_DEMONSTRATED` until reconciled.

**Current decision:** Preserve both facts. Do not rewrite the historical document silently. Reconcile the packet, environment, exact HEAD, receipts, runtime code, finality, and state readbacks in `GAP-001`.

**Evidence:** `foundry/evidence/01-judge-path/REPORTED_EXTERNAL_RUN.md`

**ADR:** Required only if the old limitation and the new runtime evidence imply a changed architecture or authority boundary.

## CLR-CON-004 — Product decision versus current frontend implementation

**Status:** `OPEN / DEFERRED`

**Source A:** `docs/product/PRODUCT_DECISION.md` remains `PROPOSED / NOT YET CANONICAL` and says broader frontend work should wait for acceptance.

**Source B:** The UI candidate implements a bounded Try surface with dedicated routes.

**Conflict:** A provisional product decision and a bounded implementation coexist.

**Impact:** The Try surface may be used as a judge-path candidate, but it must not be presented as the ratified production product or expanded into a broad institutional workbench.

**Current decision:** Admit only the bounded judge-path scope in `PRD.md`; defer broader product promotion to `GAP-002`.

**Evidence:** `PRD.md`, `docs/product/PRODUCT_DECISION.md`, `docs/product/GAP_ANALYSIS.md`
