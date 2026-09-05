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

- [`GROUND_TRUTH.md`](docs/canonical/GROUND_TRUTH.md) — authoritative status and
  protected semantic boundaries.
- [`IMPLEMENTATION_LEDGER.md`](docs/development/IMPLEMENTATION_LEDGER.md) —
  milestone-by-milestone evidence ledger.
- [`INDEXED_READ_MODEL.md`](docs/development/INDEXED_READ_MODEL.md) — local
  deterministic projection boundary.
- [`WEBAPP_SURFACE.md`](docs/development/WEBAPP_SURFACE.md) — proposed
  relationship/workbench UX; no frontend implementation claim.
- [`COMPLIANCE_BOUNDARY.md`](docs/development/COMPLIANCE_BOUNDARY.md) — what
  this hackathon package does and does not address.
- [`SLA_SLO.md`](docs/development/SLA_SLO.md) — operational targets and
  dependency limits; no customer SLA claim.
- [`AUTHORITY_MATRIX.md`](docs/development/AUTHORITY_MATRIX.md) — who may
  observe, authorize, sign, or reconcile each boundary.
