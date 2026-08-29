# Cleara Contradictions Ledger

## CLR-CON-001 — Tooling pin drift

Resolved in the repository scaffold before first bootstrap:

- pnpm 11.23.0 -> 11.24.0
- Turborepo 2.10.12 -> 2.10.10
- Wrangler 4.127.1 -> 4.127.0
- Supabase CLI 2.116.0 -> 2.115.0

The repository-scaffold copies use the reconciled pins. Historical v0.1 artifacts outside the repository may still contain the earlier draft values and should not be used for bootstrap without reconciliation.

## CLR-CON-002 — Repository creation

RESOLVED.

Canonical repository now exists at:

`https://github.com/etvjay/Cleara`

The repository was initialized on 29 August 2026 and the M0 executable scaffold was committed to `main`.

## CLR-CON-003 — Live JSON-RPC execution

OPEN.

The current assistant sandbox cannot perform the required arbitrary outbound POST JSON-RPC calls to the live Creditcoin endpoint. G0-G3 probe scripts are committed, but their live results must be produced from a networked Cleara developer runtime and then recorded as evidence.
