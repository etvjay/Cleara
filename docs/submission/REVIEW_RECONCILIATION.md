# Submission Review Reconciliation

This document records how the local submission slice addresses the architecture review without changing Cleara's protocol or evidence claims.

## Shared case integrity

`apps/web/src/case.ts` exposes one deterministic case graph with the lifecycle:

`claim → financeability → encumbrance → facility → allocation → commitment → capitalization → obligation → clearing → residual → route → native settlement → proof → reconciliation → lifecycle terminal state`.

The provider, sponsor/debtor, and operator/auditor views all derive their summaries and selected stages from the same `seedCase()` graph. The case ID is explicitly a read-model identifier (`case:composite:m3-m11-lifecycle`), not an on-chain authority or transaction identifier.

## Evidence manifest and boundary

`docs/submission/evidence-manifest.json` is the machine-readable manifest. Each record includes an evidence level, explicit evidence mode, workflow run, artifact, source chain, EVM chain ID, chain key where applicable, source transaction/block fields, finality, Attestcoin coordinates, Creditcoin transaction field, authority, current state, source observation, proof status, Creditcoin status, reconciliation status, next permitted action, and source document.

The combined workbench record is `COMPOSITE_FIXTURE`. M7–M10, M11, and M11-Lifecycle remain separate evidence records. `fixture_from_live_evidence` means the local fixture is derived from an existing evidence record; it does not turn those records into one continuous run.

## Projection boundary

The local workbench is a deterministic read-only adapter over fixture/read-model data. It exposes uncertainty and investigation items for pending proof, pending source, mismatch, stale/reorg-style recovery, and reconciliation. It does not claim a production indexer, RPC backfill, durable proof worker, production API, canonical database, or live UI write path.

The complete claim/obligation/clearing/residual/settlement lifecycle in the workbench is presentation composition over separately evidenced records. The local projection core remains limited to its documented commitment, allocation, facility, evidence, lifecycle, accounting, consistency, finality, and reorg responsibilities.

## Authority and state semantics

The UI keeps route, settlement-pending, settled, proof, and reconciliation states distinct. `SETTLED` is fail-closed in the adapter: it requires the expected route, successful native receipt, exact payer/recipient/token/domain/amount receipt data, accepted and consumed Attestcoin evidence, matching canonical reconciliation evidence, and agreement across the required stages.

The workbench cannot authorize or submit a financial transition. Proof is not authorization; observed source data is not automatically proven; a route is not settlement; and the projection is not canonical financial state.

## Capability matrix

The case presents Creditcoin CC3 as canonical coordination and financial state; Ethereum Sepolia as the exercised source and settlement domain; Attestcoin as source readability/proof; Ethereum Mainnet as readability substrate only; and Base, Arbitrum, and BNB as unsupported for this slice. Local projection is shown as local scaffolding rather than a connected chain.

## Production deferrals

The implementation status is:

- local read-only workbench: `IMPLEMENTED_LOCAL`;
- production indexer: not claimed;
- production API: not claimed;
- production frontend: not claimed;
- live UI writes: not claimed;
- production settlement: not claimed;
- M15: deferred production frontend maturity, not absence of a local workbench.

No wallets, secrets, RPC writes, funds, mainnet, custody, KYC/AML, unsupported chain adapters, or additional protocol contracts are introduced by this submission slice.
