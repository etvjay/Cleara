# Slice B verification report

## Status

`PASS_WITH_LIMITATIONS`

## Local gates

Executed from `/tmp/cleara-submission-1417435`:

```text
pnpm install --frozen-lockfile       PASS
pnpm nomos:check                     PASS, 5 Nomos tests
pnpm check:projection                PASS, 8 projection tests
pnpm web:check                       PASS, 15 web tests, build, HTTP smoke, scan
forge fmt --check                    PASS
forge build                          PASS
forge test                           PASS, 96 tests
pnpm --filter @cleara/multichain-execution typecheck PASS
pnpm --filter @cleara/multichain-execution test PASS, 16 tests
node --import tsx scripts/slice-b/demo.ts PASS
```

## API readback

Verified HTTP 200 responses for:

```text
/health
/relationships/relationship:slice-b:fixture
/relationships/relationship:slice-b:fixture/timeline
/relationships/relationship:slice-b:fixture/graph
/snapshots/relationship:slice-b:fixture
```

The relationship response exposes `source: projection`, `canonical: false`, and `evidenceMode: local_projection`.

## Security and authority

- No wallet or private key access.
- No secrets read or printed.
- No RPC writes.
- No funds moved.
- No transaction signing or broadcasting.
- No mutation API route.
- Projection cannot be marked canonical by the new API boundary.
- M9 and M11 contracts were not modified.

## Warnings and limits

- Local Node is `22.23.2`; repository declares Node `24.19.0`.
- Foundry reports existing timestamp and unsafe-cast lint warnings; build and tests pass.
- Browser verification remains `BROWSER_VERIFICATION_BLOCKED` if Chromium is unavailable.
- Hosted deployment is `NOT_VERIFIED`.
- The local API uses an in-memory deterministic fixture, not durable production persistence.
- Historical testnet evidence was not rerun.
