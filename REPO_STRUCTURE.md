# Repository Structure

This is the portable Cleara repository map. `BUILD_FOUNDRY.md` is the governing standard; this file is the quick orientation layer.

## Control plane

```text
BUILD_FOUNDRY.md       universal execution and evidence rules
AGENTS.md              agent read order and project boundaries
PRD.md                admitted product/slice scope
STATUS.md             current verified state and evidence ceiling
foundry/state.json     machine-readable phase state
foundry/gaps.jsonl     append-only material gap ledger
foundry/claims.jsonl   append-only claim ledger
foundry/assumptions.md unresolved assumptions
foundry/contradictions.md conflicting sources or reports
foundry/phases/        phase objectives and exit gates
foundry/evidence/      sanitized run and review evidence
```

The control plane records claims and evidence. It does not contain application implementation.

## Product and protocol planes

```text
apps/                  user-facing applications
packages/              shared libraries, when present
services/              backend services, when present
contracts/             onchain code, when present
workers/               hosted workers, when present
```

Only include a domain directory when the project actually owns that domain. Do not create empty or ceremonial layers.

## Verification and operations

```text
scripts/check-foundry  control-plane consistency check
scripts/verify         canonical local verification entrypoint
scripts/verify-phase   phase-scoped verification entrypoint
scripts/live/          bounded external runners
scripts/evidence/      independent evidence validators
scripts/probe/         read-only external probes
test/                  unit, property, integration, and contract tests
```

Live runners must declare their target, budget, write count, abort conditions, and evidence outputs. They must not become generic product logic.

## Evidence package

Each external run gets a new immutable directory under `foundry/evidence/<phase>/` containing a manifest, report, receipts, readbacks, and hashes as applicable. Credentials never enter the repository. A report supplied by an operator is labeled `REPORT_ONLY` until independently read back.

## Documentation

```text
docs/adr/              accepted architectural decisions
docs/development/     specifications and implementation notes
docs/operations/      deployment and recovery procedures
README.md              cold-reader product narrative
DEMO.md               bounded operator or judge journey
```

README claims link to `STATUS.md` or evidence records. Historical evidence is not rewritten to describe a later deployment.

## Branch contract

```text
main                    canonical integrated state
work/<slice>            active implementation
candidate/<slice>       frozen exact-head review candidate
integration/<slice>     reconciliation branch
release/<version>       optional release branch
```

Candidate branches are inputs to integration. They are not merged into one another merely because one contains frontend work and the other contains runtime work.
