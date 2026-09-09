# Cleara Submission Checklist

## Canon and evidence

- [x] Ground truth and release boundary read before editing.
- [x] Current M11 evidence linked: run `33614782209`, artifact `9841386218`.
- [x] Current M11-Lifecycle evidence linked: run `33699324988`, artifact `9873864767`.
- [x] Composite fixture is visibly labeled and documented as non-continuous.
- [x] Machine-readable evidence manifest validates explicit levels, modes, and provenance fields.
- [x] Review reconciliation documents projection, authority, capability, and production boundaries.
- [x] No production, mainnet, custody, compliance, or bridge claims.

## Workbench

- [x] One shared case graph reused by all role views.
- [x] Capital provider view.
- [x] Facility sponsor/debtor view.
- [x] Operator/auditor view.
- [x] Evidence and provenance panel.
- [x] Capability matrix with unsupported domains.
- [x] Pending proof example.
- [x] Mismatch example.
- [x] Reorg example.
- [x] Read-only, no wallet connection, no live write controls.
- [x] Deterministic seed/reset behavior.
- [x] Responsive static app build.

## Tests and gates

- [x] Existing Foundry format/build/tests pass before changes.
- [x] Existing projection typecheck/tests pass before changes.
- [x] Web typecheck and tests pass after final edits.
- [x] Web build passes after final edits.
- [x] Full contract, projection, and web gates pass together after final edits.
- [x] `git diff --check` passes.
- [x] Secret/personal-data scan passes.
- [x] Independent code review completed before commit.

## Runtime classification

- Implementation: `LOCAL_INTEGRATED`.
- Evidence: existing protocol slices are `TESTED_TESTNET`; workbench is fixture/read-model backed.
- Deployment URL: none claimed until independently verified.
- Production status: not claimed.
