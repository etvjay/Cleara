# Slice D parallel handoff

Status: `D0_CONFIGURED_FOR_LOCAL_DEMO`

```text
D implementation: NOT_STARTED
D0 source scope: CONFIGURED_FOR_LOCAL_DEMO
live-read: NOT_VERIFIED
branch: verification/slice-d0-source-scope
base: b84721cfa0673eaff3ff3dc320e31453b3a71484
manifest: workers/slice-d/source-scope/manifest.json
manifest hash: 4ea1254bd6b60015cfe79bf3c07aacf45464772e1ca6fb33fdbc78bf4ba7e8b8
```

D0 defines one fixture-only Ethereum Sepolia scope for the repository-defined
`CapitalCommitted` event. It does not add a provider, ingestion loop,
backfill, API route, retry worker, or live-read path.

The source ABI and chain identity are repository-backed. The two addresses in
the manifest are deterministic fixture identifiers only. No historical M6 or
M11 deployment address is treated as current. The source-event-to-relationship
mapping is explicit and local-only:

```text
CapitalCommitted.sourceCommitmentId
  -> relationship:fixture:capital-commitment:{sourceCommitmentId}
```

The parser rejects `LIVE_READ` unless live deployment fields, live address
roles, an available status, and a verified mapping declaration are all
present. The current manifest intentionally fails that live-read availability
check and reports `NOT_VERIFIED`.

D0 validation:

```bash
pnpm exec tsx --test workers/slice-d/source-scope/test/manifest.test.ts
pnpm exec tsc --noEmit -p workers/slice-d/source-scope/tsconfig.json --typeRoots workers/multichain-execution/node_modules/@types
```

No D implementation or live evidence may be added until a stable live
contract/token deployment and authoritative live relationship mapping are
separately configured and verified.
