# M9 Bilateral Clearing — Live Testnet Evidence

Date: 29 August 2026
Status: PASS
Milestone: M9 ClearingEngine / ClearingEpoch

## Execution

GitHub Actions run: `33280768286`
Head exercised: `f7205170d7d709921f8572dae7a9c01ec693ec13`
Artifact ID: `9722957475`
Artifact SHA256: `3aede24e78500b998a9438d62be969eda200adf7040d792449902a0041f6be12`

Build/property gate:

```text
forge fmt --check PASS
forge build --sizes PASS
forge test -vvv PASS
59 tests passed
0 failed
0 skipped
```

M9 fuzz properties each passed 1,000 generated cases:

```text
bilateral conservation
non-reciprocal obligations never clear
reciprocity without explicit authorization never mutates
```

## Reused M7 State

M9 reused the live M7 capitalization rather than reconstructing a synthetic facility.

```text
FacilityManager: 0xa9662e17409976Cc2886404394ab8714E7bC7224
facilityId: 0x772ed1527b2137634f30da4dd62245906719b697dc7ca0bd27e11a8a2d5c7a73
sponsor: 0x5ac98dc6f8408564645f36195aC0F9c5B1c0C0C8
assetClassId: 0x1cda873901f7e3d40e3c769bad5e796dde83cc8879f8425ac25ac3ff12fbeb77
capitalizationRoot: 0x1ca109babcb91c33eb6124d1693b27fe6d9397cfa0730e56ce765feb3ae0f512
capitalRequiredUntil: 1788123587
facility status: CAPITALIZED
CC3 block timestamp at preflight: 1788045690
```

## CC3 Evidence Deployments

```text
ObligationLedger V2:      0xCe29e08e9668aa0c3CE3A2C9E29774a2233abB86
ClearingPolicyRegistry:   0xE376fe50c831DB797d9168289A01Bce02Cc4c997
ClearingEngine:           0xe87835B72e49EEBe4778c8769A0546a216A71f69
```

The M8 deployment was not treated as upgradeable. M9 deployed a new ledger version containing the narrowly scoped clearing mutation authority.

## Live Economic Vector

A drawdown obligation and a reciprocal financing-fee obligation were created under the same facility and asset class:

```text
Provider A -> Sponsor drawdown   400,000
Sponsor -> Provider A fee         60,000
                               ---------
gross before                     460,000
```

Drawdown obligation:

```text
obligationId: 0x330647cb907ce83563e27d406c3c3789b2756705ff4cbb1aa8c63a65d0966129
create tx: 0x93536131e9f25e7347af2c1bad6d3642042b829bfcca52059115c087caa568cf
finalize tx: 0x9d7e0065f96017732d50e06097f895bb4a017c1bfd3ac27b1a4a58b4b5e3f979
originalAmount: 400,000
clearedAmount: 60,000
remaining: 340,000
```

Financing-fee obligation:

```text
obligationId: 0x2368e5edab11f2c0bafdf20672794924523581b71abccb1531e6c921b379d3f7
create tx: 0x45a152a67a2d0c9fb64fcdb7c6151bdae01c31dd647f4f29d282bfad6f9d646a
finalize tx: 0x09d507895ccd0e87ca2f38266e61abb5328601db26e8502699888e648e1df969
originalAmount: 60,000
clearedAmount: 60,000
remaining: 0
```

## Explicit Clearing Policy

```text
clearingPolicyId:
0x6b3a85f3e2cf72d9cc3a837625e13347f310577e16814ac07b1bbcfc5b1be70a

compatibilityHash:
0x8a403c0cb2a24ac719d3ddc4ae296c1eefdb3dbeaacd8695bbac8075a1bc0761

mode: BILATERAL
```

The compatibility hash is an explicit governed assertion. This run does not prove legal setoff enforceability.

## Clearing Epoch

```text
epochId:
0xb16d67f3a82e4e79409c344f012565125e77fbd2293be85404a7de10abf1f8c2

inputRoot:
0xa75b8beb36648c8f1103deee1f123c7ab4114dbf54af9981ca631ba851aa1e62

grossBefore:      460,000
clearingAmount:    60,000
grossAfter:       340,000
movementReduced:  120,000
status:            FINALIZED
```

Canonical bilateral conservation:

```text
c = min(x, y)
grossAfter = grossBefore - 2c
```

For `x=400,000` and `y=60,000`:

```text
c = 60,000
grossBefore = 460,000
grossAfter = 340,000
movementReduced = 120,000
```

## Live Negative Paths

All rejected:

```text
reciprocity without explicit clearing authorization
MULTILATERAL policy configuration during M9
clearing epoch reseal
```

## Proven Semantic Boundary

M9 proves on CC3 testnet:

```text
FINALIZED obligations
-> explicit bilateral clearing authorization
-> exact reciprocal-party / asset / policy checks
-> immutable epoch input root
-> deterministic bilateral setoff
-> clearedAmount accounting
-> residual economic amount remains un-settled
```

The key boundaries are:

```text
RECIPROCITY != SETOFF AUTHORITY
CLEARING AUTHORIZATION != CLEARING EXECUTION
CLEARING != SETTLEMENT
```

## Limitations

- M9 is bilateral-only. Multilateral novation/netting remains disabled.
- The live compatibility hash is governed protocol metadata, not proof of legal enforceability.
- The remaining `340,000` is an economic residual only; M9 creates no `ResidualLedger` entry.
- No `SettlementRouter` instruction was created.
- No value moved as part of M9 clearing.
- No settlement evidence was ingested.
- These are evidence deployments, not production contracts.
