# M11 Attested Settlement Reconciliation

Status: `PASS` for the historical implementation exercised at commit `8e6788e7e82f80f3da2a8212baec79be6b66ca90`.

## GitHub evidence

```text
Workflow: M11 Live Attested Settlement
Run: 33349834574
Artifact: 9744064841
Artifact SHA256: 4402faf1ff2dc265643339e7bb5caffda0c91df2bd80fbaec1d8baf32fa85ab0
Job: settlement / 99364580985
Result: success
Run URL: https://github.com/etvjay/Cleara/actions/runs/33349834574
Artifact URL: https://github.com/etvjay/Cleara/actions/runs/33349834574/artifacts/9744064841
```

## Exercised path

```text
Sepolia SettlementAdapter ERC20 execution
-> Attestcoin proof for the successful source transaction
-> SettlementASC acceptance on Creditcoin CC3
-> one-time evidence consumption
-> SettlementReconciler
-> residual SETTLED
-> source obligation SETTLED
```

Historical run facts:

```text
Sepolia chainId: 11155111
Creditcoin CC3 chainId: 102031
Source settlement amount: 340,000
Source debtor balance: 340,000 -> 0
Source creditor balance: 0 -> 340,000
Attestcoin chainKey: 1
Attestcoin evidenceConsumed: true
Drawdown settledAmount: 340,000
Drawdown remaining: 0
Residual status: SETTLED
Reconciled: true
Replay: rejected
Wrong chain: rejected
```

The run used a fresh Sepolia mock-token settlement fixture. It does not prove production stablecoin settlement, legal finality, a production settlement rail, or mainnet readiness.

## Current-head qualification

The current `main` head adds two stricter checks after this run:

```text
SettlementASC requires an exact ERC20 Transfer whose topics[1] payer matches the residual debtor.
The workflow independently validates the source receipt and Transfer payer offchain.
```

Those changes are locally implemented but require a fresh M11 workflow run against the current head before M11 can be promoted to current-head `TESTED_TESTNET`.
