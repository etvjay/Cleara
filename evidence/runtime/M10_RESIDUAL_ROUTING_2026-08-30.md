# M10 Residual Ledger / Settlement Routing — Live Testnet Evidence

Date: 30 August 2026
Status: PASS
Milestone: M10 ResidualLedger / SettlementRouter

## Execution

GitHub Actions run: `33311029527`
Head exercised: `9388ec6ef5c4511f560f35b8d3c06d21f3f95985`
Artifact ID: `9731999552`
Artifact SHA256: `0071c3f003a6f4c1f3839cc4849ce450365f5385cf186ddeb44ba002328affc0`

Build/property gate:

```text
forge fmt --check PASS
forge build --sizes PASS
forge test -vvv PASS
72 tests passed
0 failed
0 skipped
```

M10 fuzz properties each passed 1,000 generated cases:

```text
post-clearing residual equals exact bilateral difference
equal bilateral amounts do not materialize a zero residual
routing never mutates obligation settlement accounting
```

## Reused M9 State

M10 consumed the actual finalized M9 clearing epoch rather than reconstructing a synthetic epoch.

```text
ClearingEngine: 0xe87835B72e49EEBe4778c8769A0546a216A71f69
ObligationLedger V2: 0xCe29e08e9668aa0c3CE3A2C9E29774a2233abB86

epochId:
0xb16d67f3a82e4e79409c344f012565125e77fbd2293be85404a7de10abf1f8c2

assetClassId:
0x1cda873901f7e3d40e3c769bad5e796dde83cc8879f8425ac25ac3ff12fbeb77

grossBefore:      460,000
clearingAmount:     60,000
grossAfter:        340,000
movementReduced:   120,000
epoch status:      FINALIZED
```

The M9 engine stores epoch membership in canonical `bytes32` sort order, not economic-direction order:

```text
obligationA:
0x2368e5edab11f2c0bafdf20672794924523581b71abccb1531e6c921b379d3f7

obligationB:
0x330647cb907ce83563e27d406c3c3789b2756705ff4cbb1aa8c63a65d0966129
```

The live M10 preflight therefore validates epoch membership as an unordered exact two-member set and derives economic direction from the obligation records themselves.

## CC3 Evidence Deployments

```text
ResidualLedger:
0xeb8f98D41ad6f626d8808F70c7b0C455Fd248384

SettlementRouter:
0x425E8b8c38025dFD886446947209D21407dC7319
```

## Derived Residual

The source obligation is the M9 drawdown obligation:

```text
sourceObligationId:
0x330647cb907ce83563e27d406c3c3789b2756705ff4cbb1aa8c63a65d0966129

debtor:   0x8766760e375bD43f600D23C40aDCeeDD62a60e2b
creditor: 0x5ac98dc6f8408564645f36195aC0F9c5B1c0C0C8
originalAmount: 400,000
clearedAmount:   60,000
settledAmount:        0
remainingAmount: 340,000
```

Residual created:

```text
residualId:
0xb7b1905b8e4b08c9db578059492c47d6464e61b5b20c14c0c4b6c9721ccbeae6

create tx:
0x4e4268ec7655d0ebea907f28dc7c3b3fa2405f56eabb726f108fcb45ea68792b

amount: 340,000
residualIndex: 0
status before route: CREATED
status after route:  ROUTED
```

The amount is derived onchain from finalized obligation accounting. It is not supplied as an arbitrary operator parameter.

Canonical identity:

```text
keccak256(
  abi.encode(
    "CLEARA_RESIDUAL_V1",
    epochId,
    debtor,
    creditor,
    residualIndex
  )
)
```

## Settlement Route Instruction

One route instruction was recorded:

```text
settlementId:
0x82b7b4c56e20cbb8c3ac0013282e26a4f9288dedfd9f4f8ee0091687b358f40b

route tx:
0x9cc4dea116a9700e2f9a63e2ab4163b9f2480475292830f9406a00b0c738a5d0

adapterId:
0x2ca41e2da55ab1f458d352eb7d19c418138ab60be8495bd529dba8d3127f5270

settlementDomainId:
0x2233a0381f0bdc13be3b2ae8d0a1425ba66031e88b08c6d1fa8651aba65545cf

settlementRepresentationId:
0x3eecb3b223acecd2d4be3bfd18d01fef061d23a2840008ec59b1181ada241b1f

routeDataHash:
0x9bcb3e1dbc145f54552868b30f9376026040b611ebdd47b4074b99edb5145437

settlementNonce: 0
route status: ROUTED
```

These route identifiers are explicit test-only identifiers. M10 does **not** yet authenticate the domain or asset-representation identifiers against `DomainRegistry` / `AssetRegistry`.

```text
identifiersAuthenticatedAgainstRegistries: false
```

## Settlement Accounting Boundary

Live accounting before and after routing:

```text
drawdown settledAmount before: 0
drawdown settledAmount after:  0
fee settledAmount before:      0
fee settledAmount after:       0
```

Therefore:

```text
ROUTED != SETTLED
ECONOMIC RESIDUAL != SETTLEMENT EXECUTION
```

No M10 method can mark the obligation or residual `SETTLED`.

## Live Negative Paths

Both rejected:

```text
duplicate residualization of the same finalized epoch
duplicate routing of the same residual
```

## Proven Semantic Boundary

M10 proves on CC3 testnet:

```text
FINALIZED M9 clearing epoch
-> exact post-clearing obligation accounting
-> canonical derived residual
-> one ResidualLedger record
-> one SettlementRouter route instruction
-> obligation settlement accounting unchanged
```

M10 does not prove or perform:

```text
settlement adapter execution
value movement
bridge execution
settlement finality
settlement evidence ingestion
obligation settledAmount mutation
residual SETTLED mutation
route-domain registry authentication
asset-representation registry authentication
```

## Important Harness Finding

The first live M10 attempt failed preflight because it assumed `epoch.obligationA/B` encoded semantic direction. M9 deliberately sorts the two obligation IDs lexicographically when sealing an epoch. The corrected harness validates membership as an unordered exact set and derives direction from the obligations themselves. No M10 contract semantic change was required.

The failed first artifact is not promotion evidence.

## Limitations

- The route is metadata/instruction only.
- The test-only settlement domain and representation IDs are nonzero but not registry-authenticated.
- No external settlement adapter was called.
- No token/value moved as part of M10.
- No Attestcoin settlement proof exists yet.
- No settlement reconciliation exists yet.
- These are evidence deployments, not production contracts.
