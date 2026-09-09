# Cleara Domain Model

Status: `PROPOSED / HYPOTHESIS`

## Product primitive

The product primitive is an **obligation relationship**: a bounded facility-linked set of finalized reciprocal obligations, the authorized clearing decision over those obligations, the residual route, native settlement, evidence, and reconciliation lifecycle.

## Nouns

| Noun | Meaning | Canonical owner | Not this |
|---|---|---|---|
| Claim | Source-linked economic fact eligible for protocol treatment | Claim/registry path | Not authorization |
| Facility | Bounded financing relationship and accounting container | Creditcoin CC3 | Not a wallet |
| Allocation | Provider amount reserved for a facility | Creditcoin CC3 | Not committed capital |
| Capital commitment | Source-chain capital constrained for a facility | Source chain plus CC3 commitment state | Not a balance |
| Obligation | Finalized financial amount between parties | Creditcoin obligation ledger | Not a payment instruction |
| Clearing epoch | Explicit authorized reciprocal reduction | Creditcoin clearing engine | Not settlement |
| Residual | Economic amount remaining after clearing | Creditcoin residual ledger | Not a receipt |
| Route | Metadata/instruction for residual movement | Creditcoin settlement router | Not settled state |
| Source receipt | Native execution observation | Source chain | Not proof of financial meaning |
| Attestcoin evidence | Proof of source inclusion/continuity | Attestcoin | Not financial authorization |
| Reconciliation | Agreement between evidence, accounting, and canonical state | Creditcoin reconciler | Not an indexer status |
| Projection | Derived read model used for investigation and UX | Local/indexer layer | Not canonical state |

## Relationships

```text
claim
  -> financeability
  -> encumbrance
  -> facility
  -> allocation
  -> capital commitment
  -> capitalization
  -> obligation
  -> bilateral clearing
  -> residual
  -> route
  -> native settlement
  -> Attestcoin proof
  -> Creditcoin reconciliation
  -> commitment lifecycle
```

## Identity keys

- obligation relationship ID: off-chain/read-model grouping key;
- facility ID: Creditcoin canonical facility identity;
- obligation ID: Creditcoin obligation identity;
- clearing epoch ID: authorized clearing identity;
- residual ID: Creditcoin residual identity;
- source transaction hash plus domain: source observation identity;
- Attestcoin evidence identity: proof identity;
- Creditcoin transaction/log identity: coordination evidence identity.

A case ID is never an on-chain financial authority.

## Capability model

- Creditcoin CC3: canonical coordination and financial state.
- Ethereum Sepolia: exercised source commitment and settlement execution domain.
- Attestcoin: source-chain readability and inclusion/continuity proof.
- Ethereum Mainnet: readability substrate only for this slice.
- Base, Arbitrum, BNB: unsupported/not configured for this slice.
