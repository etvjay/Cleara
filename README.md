# Cleara

Cleara is a proof-native, multichain financing and clearing coordination
protocol. Creditcoin CC3 holds canonical coordination and financial state;
source chains provide native actions and independently verifiable facts through
Attestcoin readability.

## Current release status

The hackathon protocol package is ready for review on testnet:

| Area | Status |
| --- | --- |
| M1 verification substrate | `VERIFIED_CLEARA` |
| M2-M11 protocol slices | `TESTED_TESTNET` |
| M11 commitment lifecycle | `TESTED_TESTNET` |
| Indexed projection core | `IMPLEMENTED_LOCAL` |
| Read-only institutional workbench | `IMPLEMENTED_LOCAL` |
| Slice B indexed relationship read model | `IMPLEMENTED_LOCAL` |
| Production indexer, API, and frontend | Not claimed |

Current-head live gates passed independently:

- M11 settlement: workflow run `33614782209`, artifact `9841386218`.
- M11-Lifecycle: workflow run `33699324988`, artifact `9873864767`.

These are ephemeral testnet demonstrations. Cleara is not mainnet deployed,
audited, licensed, approved for production value, or a substitute for custody,
KYC/AML, sanctions, accounting, or legal systems.

The canonical operating truth is
[`docs/canonical/GROUND_TRUTH.md`](docs/canonical/GROUND_TRUTH.md). The
release boundary and deferred work are recorded in
[`docs/development/HACKATHON_RELEASE_CHECKLIST.md`](docs/development/HACKATHON_RELEASE_CHECKLIST.md).

The local submission workbench runs with:

```bash
pnpm web:check
pnpm web:dev
```

It is read-only, fixture/read-model backed, and requires no wallet or secret.

Slice B local read-model demo and adversarial checks:

```bash
pnpm slice-b:demo
pnpm slice-b:adversarial
pnpm slice-b:dev
```

The adversarial command is local evidence only. It does not request proofs, write RPC state, or imply production indexing.

See [`DEMO.md`](DEMO.md), [`ARCHITECTURE.md`](ARCHITECTURE.md), and [`SLICE_B_SPEC.md`](docs/development/SLICE_B_SPEC.md).

## What the protocol demonstrates

```text
verified claim
  -> financeability and encumbrance
  -> facility and provider allocation
  -> source-chain capital commitment
  -> Creditcoin capitalization
  -> obligation and bilateral clearing
  -> residual settlement
  -> Attestcoin proof and reconciled state
```

The core boundaries are deliberate:

- proof is not financial authorization;
- an allocation is not a capital commitment;
- clearing is not settlement;
- submitted is not settled; and
- a database projection is not canonical financial state.

Cleara is not a bridge, universal wallet, custody layer, or globally atomic
settlement system.

## Local verification

The projection core is pure, read-only TypeScript. It has no signer, RPC, or
transaction side effect.

```bash
corepack enable
corepack prepare pnpm@11.24.0 --activate
pnpm install --frozen-lockfile
pnpm check:projection
```

Contract formatting, build, property tests, and live testnet gates run in the
GitHub Actions workflows under `.github/workflows/`. The live workflows consume
testnet deployer keys from repository/environment secrets; keys are never part
of the repository, UI, or uploaded evidence.

## Documentation map

- [`GROUND_TRUTH.md`](docs/canonical/GROUND_TRUTH.md) — authoritative status and protected semantic boundaries.
- [`EVIDENCE_INDEX.md`](docs/submission/EVIDENCE_INDEX.md) — human and machine-readable evidence index; the structured manifest is `docs/submission/evidence-manifest.json`.
- [`REVIEW_RECONCILIATION.md`](docs/submission/REVIEW_RECONCILIATION.md) — architecture-review reconciliation and scope boundary.
- [`IMPLEMENTATION_LEDGER.md`](docs/development/IMPLEMENTATION_LEDGER.md) —
  milestone-by-milestone evidence ledger.
- [`INDEXED_READ_MODEL.md`](docs/development/INDEXED_READ_MODEL.md) — local
  deterministic projection boundary.
- [`SLICE_B_SPEC.md`](docs/development/SLICE_B_SPEC.md) — finality-aware,
  replayable relationship read-model contract.
- [`SLICE_B_VERIFICATION.md`](docs/development/SLICE_B_VERIFICATION.md) — local
  Slice B verification and limitations.
- [`SLICE_B_COMPATIBILITY_CONTRACT.md`](docs/development/SLICE_B_COMPATIBILITY_CONTRACT.md) — frozen serialized read-only handoff for isolated Slice C consumers.
- [`WEBAPP_SURFACE.md`](docs/development/WEBAPP_SURFACE.md) — narrow local
  read-only workbench implemented; complete participant/operator surface remains
  proposed.
- [`COMPLIANCE_BOUNDARY.md`](docs/development/COMPLIANCE_BOUNDARY.md) — what
  this hackathon package does and does not address.
- [`SLA_SLO.md`](docs/development/SLA_SLO.md) — operational targets and
  dependency limits; no customer SLA claim.
- [`AUTHORITY_MATRIX.md`](docs/development/AUTHORITY_MATRIX.md) — who may
  observe, authorize, sign, or reconcile each boundary.
