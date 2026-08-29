# M8 Obligation Ledger — Live Testnet Evidence

Date: 29 August 2026
Status: PASS
Milestone: M8 ObligationLedger

## Execution

GitHub Actions run: `33280253700`
Head exercised: `1a49c9db3897c1de52adce588fb15d1064c9f187`
Artifact ID: `9722789518`
Artifact SHA256: `89b53706a08a8e9af4b91be6e76c12436cd1fb4ec46a52ed7574f91bd2123c44`

Build/property gate:

```text
forge fmt --check PASS
forge build --sizes PASS
forge test -vvv PASS
51 tests passed
0 failed
0 skipped
```

M8 fuzz properties each passed 1,000 generated cases:

```text
valid issuance preserves economic terms exactly
invalid issuance never consumes facility nonce
finalization changes status only and preserves economic terms/value accounting
```

## Network

```text
Creditcoin CC3 chainId: 102031
signer: 0x5ac98dc6f8408564645f36195aC0F9c5B1c0C0C8
CC3 block timestamp at M8 preflight: 1788044925
```

## Reused M7 State

M8 did not construct a synthetic capitalization fixture. It consumed the actual M7 testnet facility and seal:

```text
FacilityManager:
0xa9662e17409976Cc2886404394ab8714E7bC7224

facilityId:
0x772ed1527b2137634f30da4dd62245906719b697dc7ca0bd27e11a8a2d5c7a73

sponsor:
0x5ac98dc6f8408564645f36195aC0F9c5B1c0C0C8

assetClassId:
0x1cda873901f7e3d40e3c769bad5e796dde83cc8879f8425ac25ac3ff12fbeb77

capitalizationRoot:
0x1ca109babcb91c33eb6124d1693b27fe6d9397cfa0730e56ce765feb3ae0f512

capitalRequiredUntil: 1788123587
encumberedAmount:      1,000,000
allocatedAmount:       1,000,000
committedAmount:       1,000,000
FacilityStatus:        CAPITALIZED
```

The live harness failed closed if the M7 facility, root, asset, capitalization horizon, or accounting had drifted.

## M8 Deployment

```text
ObligationLedger:
0x8F70ef4A83eb04fa6f303F0d80031f2aA3741b39
```

## Economic Vector

The M8 live vector models the drawdown rights created by the M7 capital composition.

The committed providers are debtors of the drawdown obligations and the capitalized facility sponsor is creditor:

```text
Provider A -> Sponsor  400,000
Provider B -> Sponsor  350,000
Provider C -> Sponsor  250,000
                      ---------
Total                 1,000,000
```

This avoids fabricating repayment obligations before a drawdown exists.

Common policy:

```text
policyId:
0xf30800e9be648578d4c70e8af88f241dff2ee2ecce3d92f4fec90b6ce8a738b0

maturity:
1788088125

kind:
DRAWDOWN
```

### Obligation 0

```text
nonce: 0
obligationId:
0x330647cb907ce83563e27d406c3c3789b2756705ff4cbb1aa8c63a65d0966129

debtor:   0x8766760e375bD43f600D23C40aDCeeDD62a60e2b
creditor: 0x5ac98dc6f8408564645f36195aC0F9c5B1c0C0C8
amount:   400,000
remaining: 400,000
status: FINALIZED

create tx:
0x345a1370e51ffe30aa48e03beaa01e0841a8851a4684c89c7ee640a1bc2a49f0

finalize tx:
0xbbad54e1b0e409c489bed0c39861a109855a5b7a1bb893596cb4a83a78356845
```

### Obligation 1

```text
nonce: 1
obligationId:
0xa4aeab1d0e3790b108f92dc430f9150ccf35cb0d1112abeccbe69ce18ea1f4ee

debtor:   0x9c97121F58967a5D4E060467aa4ec704A4c20D8c
creditor: 0x5ac98dc6f8408564645f36195aC0F9c5B1c0C0C8
amount:   350,000
remaining: 350,000
status: FINALIZED

create tx:
0xf1d85f6e2eeb5eba6b22a5c3bed0af6c72a6480dbd5c1d40ef914b98c20a8d65

finalize tx:
0xf7cc1f52ab6e60b05053c6710d8998d1523bade504fe4ceda7d21ccc2d7df32a
```

### Obligation 2

```text
nonce: 2
obligationId:
0x3ff9156fbfbcba9bf2dcac4750f2be6950c66f5a59e57c6a4814a52dba8bee99

debtor:   0xA4498B69683178ab46133BEc4A140de670A0C2D2
creditor: 0x5ac98dc6f8408564645f36195aC0F9c5B1c0C0C8
amount:   250,000
remaining: 250,000
status: FINALIZED

create tx:
0x7702be65a74d8420b2c695647f4caeff52fe226343a65d04e53e4440bc43c2ec

finalize tx:
0xc270e329ae252aac73cd532a59571822741115e50731da9e6d05be201f2842a5
```

Aggregate result:

```text
obligationCount: 3
totalRemaining:  1,000,000
next facility nonce: 3
cleared amount: 0
settled amount: 0
```

No obligation became `ELIGIBLE_FOR_CLEARING`; M8 does not contain that authority.

## Live Negative Paths

All rejected:

```text
wrong asset class
self-obligation
unknown facility
double finalization
```

After all failed issuance attempts:

```text
facility obligation nonce preserved: true
```

## Proven Semantic Boundary

M8 proves on CC3:

```text
live M7 CAPITALIZED facility
-> exact facility/asset/seal/horizon precondition
-> canonical per-facility obligation nonce
-> deterministic obligation identity
-> CREATED
-> FINALIZED
```

and preserves:

```text
OBLIGATION != PAYMENT INSTRUCTION
FINALIZED != ELIGIBLE_FOR_CLEARING
FINALIZED != SETTLED
```

The tested obligation identity is:

```text
keccak256(
  abi.encode(
    "CLEARA_OBLIGATION_V1",
    facilityId,
    debtor,
    creditor,
    assetClassId,
    obligationNonce
  )
)
```

## Limitations

- M8 currently permits issuance only while the facility is exactly `CAPITALIZED`; later ACTIVE/REPAYING issuance semantics are not yet implemented.
- The executable M8 lifecycle slice is `CREATED -> FINALIZED -> DISPUTED`; other canonical states remain reserved for later milestones.
- M8 does not execute drawdown settlement. These are financial obligations/right records, not token transfers.
- M8 does not grant clearing eligibility, form a clearing epoch, compute setoff, create residuals, or settle value.
- M8 reuses the actual M7 facility, but Cleara still does not claim one uninterrupted M3 -> M8 deployment lifecycle.
- Source commitment lifecycle synchronization remains a later requirement.
- This is testnet evidence, not production deployment.
