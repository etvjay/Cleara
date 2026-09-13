# Slice D1 Demo

This demo is deterministic and local. It uses only the D0 `FIXTURE_ONLY` source scope and the injected `DeterministicFixtureProvider`.

It does not use an RPC endpoint, wallet, key, secret, proof request, write transaction, deployment, or financial workflow.

## Run

From the repository root:

```bash
pnpm exec tsx scripts/slice-d/demo.ts
```

The smoke wrapper is:

```bash
node scripts/slice-d/smoke.mjs
```

The adversarial test harness is:

```bash
node scripts/slice-d/adversarial.mjs
```

## Successful path assertions

The demo asserts:

```text
load exact D0 manifest
-> read valid CapitalCommitted fixture event(s)
-> validate source identity, header, parent, receipt, log, and ABI
-> derive relationship and object IDs through D0 mapping
-> ingest through the serialized Slice B boundary
-> advance the two-confirmation finality policy
-> checkpoint the serialized B snapshot through Slice C
-> restart from the C public readback
-> read relationship timelines and checkpoint through the read-only B API
```

The default fixture contains two events:

- block 10 is finalized at fixture latest height 12;
- block 11 remains finality-pending at depth two;
- both observations remain proof-pending and reconciliation-pending.

## Failure and recovery assertions

The demo injects a provider outage while reading the current block:

```text
provider outage
-> current cursor remains unchanged
-> retry is submitted with the serialized B checkpoint
-> retry state is serialized
-> retry state is restored
-> bounded backoff runs
-> terminal provider failure becomes a dead letter
-> explicit operator replay reopens the retry job
-> a read-only success completes the retry job
```

The retry result does not mutate source state or promote a projection to financial authority.

## Reorg assertions

The demo then replaces an earlier indexed block with a different block hash and transaction:

```text
replacement parent is checked against the source fixture
-> Slice B detects the earlier indexed-block reorg
-> old observation remains in serialized history
-> replacement remains a candidate until finality
-> Slice B replayReorg is called through the public serialized boundary
-> current checkpoint returns to CURRENT
-> D1 still exposes REORG_DETECTED in status markers
```

## Expected output shape

The final JSON reports only deterministic local outcomes and includes:

```text
mode: FIXTURE_ONLY
manifestHash: D0 hash
success.accepted: 2
success.finalizedHeight: 10
failureRecovery.deadLetter: DEAD_LETTERED
reorg.replayStatus: CURRENT
limitations: fixture-only, read-only, proof pending, no live provider, no financial authority
```

A passing demo is local implementation evidence only. It is not live source-chain evidence, Attestcoin proof, Creditcoin state, hosted durability, or production readiness.
