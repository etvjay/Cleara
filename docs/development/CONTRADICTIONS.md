# Cleara Contradictions Ledger

## CLR-CON-001 — Tooling pin drift

Resolved in local scaffold before first bootstrap:

- pnpm 11.23.0 -> 11.24.0
- Turborepo 2.10.12 -> 2.10.10
- Wrangler 4.127.1 -> 4.127.0
- Supabase CLI 2.116.0 -> 2.115.0

The canonical source artifacts outside this scaffold remain historical v0.1 copies; the repository-scaffold copies are reconciled.

## CLR-CON-002 — Repository creation

`etvjay/cleara` and `Jaydearcadian/cleara` did not resolve through the connected GitHub account at execution time. The available GitHub connector exposes repository reads and file/branch/PR mutations but no create-repository action. Repository creation remains an external prerequisite.

## CLR-CON-003 — Live JSON-RPC execution

The current sandbox runtime cannot resolve arbitrary external hosts for POST JSON-RPC calls. G0-G3 probe scripts are implemented but cannot be executed from this runtime. They must run in the real Cleara developer environment after repository creation/bootstrap.
