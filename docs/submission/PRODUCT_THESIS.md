# Cleara Product Thesis

## Product

Cleara is a proof-native, multichain financing and clearing coordination protocol with a read-only institutional workbench.

Creditcoin CC3 is the canonical coordination and financial-state environment. Source chains execute native actions. Attestcoin proves source-chain inclusion and continuity. Cleara reconciles those observations into canonical commitment, facility, obligation, clearing, settlement, and lifecycle state.

## User

The direct audience is institutional:

- capital providers;
- facility sponsors and debtors;
- credit and treasury operators;
- operations and reconciliation teams;
- auditors and authorized observers.

Consumers and generic wallet users are not the direct audience.

## Decisive workflow

```text
claim
→ financeable capacity
→ encumbrance
→ facility
→ allocations
→ provider commitments
→ capitalization
→ obligations
→ clearing
→ residual
→ settlement route
→ native settlement
→ Attestcoin evidence
→ Creditcoin reconciliation
→ commitment consumed or expired
→ terminal state
```

The workbench presents one shared composite case graph across three role views. The derived case ID is a read-model identifier only. It is not financial authority or an on-chain identifier.

## Non-negotiable boundaries

- Proof is not financial authorization.
- Allocation is not capital commitment.
- Clearing is not settlement.
- Routing is not settlement.
- A database projection is not canonical financial state.
- The workbench is read-only for this submission.
- No wallet connection or private key is required.

## Current evidence boundary

M2–M11 and M11-Lifecycle have current testnet evidence. The workbench is local fixture/read-model backed. It does not claim a production indexer, durable worker system, API, frontend deployment, production asset, custody, compliance, mainnet, or production value.
