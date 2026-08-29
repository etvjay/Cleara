# M4 Financeability and Encumbrance — CC3 Testnet Evidence

**Date:** 29 August 2026  
**Status:** PASS  
**Milestone:** M4 — Financeable Capacity + Claim Encumbrance

## Evidence Run

```text
GitHub Actions run: 33254529904
Artifact ID: 9715412301
Artifact SHA256: cb0d42256da26ba6f769b9d377dfebf830b0d44a5efafa8b8d36b345537fc940
Head SHA: e3563cdcb37fdb7d591204b0f0eff3f7709b2ce6
```

The workflow used the GitHub `testnet` environment and the dedicated CC3 testnet deployer secret. The private key was redacted by GitHub Actions.

## Build / Property Gate

```text
forge fmt --check PASS
forge build --sizes PASS
forge test -vvv PASS
22 tests passed
0 failed
0 skipped
```

M4 fuzz properties each ran 1,000 cases:

```text
testFuzzCapacityNeverExceedsFaceValue                  PASS (1000)
testFuzzAcceptedReservationsConserveCapacity           PASS (1000)
testFuzzOverReservationAlwaysReverts                   PASS (1000)
```

The current deployed bytecode sizes observed in the run were:

```text
ClaimRegistry:       4,427 bytes runtime
EncumbranceRegistry: 3,672 bytes runtime
```

## CC3 Testnet

```text
Chain ID: 102031
RPC: https://rpc.cc3-testnet.creditcoin.network
Signer: 0x5ac98dc6f8408564645f36195aC0F9c5B1c0C0C8
```

## Evidence Deployments

```text
ClaimRegistry:       0x3b12A365e9beA21035Ab811DA42F04dAfF89e1DC
EncumbranceRegistry: 0x6B1C82122165ec351407ABa272d19daEDE9f7a44
```

These are test/evidence deployments, not production contracts.

## Transactions

```text
Grant EncumbranceRegistry role:
0x065c284080e148a6dc82ff6451e6613a8e145bf8f86c7a32ad03798438a14d27

Register verified-claim fixture:
0x1fb89a36a9ba9c8ff22c9125caf149ad4803f0dd2272edaa87ea77149db6dfe2

Apply financeability decision:
0x3ae1fb26a2a823b3d76fbe0271adcfaa4376eeb471033ad183171a9882b65d16

Create encumbrance A:
0x6ba250935c06de5eb899cd76be31b78168c62b2bf62fb725f15752b0f87035df

Release encumbrance A:
0x848dd87e0bef9e0f449eb541d4615aad1c0d7b038b3f29f9a82368f272f409e8
```

## Objects

```text
claimId:
0xf585e145b859fa6fe1346ec05425a847fc73e81e4e30051d7fd94c65587eb405

encumbranceA:
0x63bd3d21e165d2dad8cf4c5319a86fa4bf3fe4110fdad889849fc4cb25992889

facilityA:
0x4df84bdc91de9985d6aa01d317933c2d816a8b42164a5b997ca05badee167b7f

facilityB:
0x132640dd942ef3f1eae764385d25f959a7acabeaec0ff894078ed32d8d2e8a73

financeability policyId:
0x08141fef066ea90a895dc85c00aeff83e3dae64d1e7243e58a225b9fd28cae35

decisionHash:
0xe092d4059c6c4e9650bd6f756fc35cce545236f5121d2f09da2f0dd1e9103593
```

## Accounting Vector

The live vector was:

```text
faceValue             = 100,000,000
financeableCapacity   =  80,000,000
first reservation     =  50,000,000
available after A     =  30,000,000
second request        =  40,000,000  -> REJECTED
release A             =  50,000,000
final active          =           0
final available       =  80,000,000
```

Therefore the live CC3 contracts preserved:

```text
activeEncumbrance <= financeableCapacity <= faceValue
availableCapacity = financeableCapacity - activeEncumbrance
```

## Negative Paths Verified Live

The run rejected:

```text
40m reservation against only 30m remaining capacity
reducing financeable capacity to 49m while 50m was actively encumbered
a second release of an already-released encumbrance
```

After the rejected over-reservation, accounting remained:

```text
activeEncumbrance = 50,000,000
availableCapacity = 30,000,000
```

After release:

```text
activeEncumbrance = 0
availableCapacity = 80,000,000
```

The current ethers surface reports Cleara custom-error reverts as `unknown custom error`; improving revert decoding is a developer-experience task and does not change the observed rejection behavior.

## Evidence Boundary

The claim used in this M4 run was registered directly through `ClaimRegistry` using its test admin/gateway role.

This was intentional: M4 tests financeability and encumbrance accounting on CC3. It does **not** replace or repeat the M3 Attestcoin claim-ingestion evidence.

M3 separately proves:

```text
Sepolia ClaimCreated
-> Attestcoin proof
-> ClaimASC validation
-> ClaimRegistry VERIFIED
```

M4 proves the next state boundary:

```text
VERIFIED claim
-> explicit financeability decision
-> ACTIVE claim with bounded capacity
-> explicit facility-bound encumbrance
-> atomic capacity reservation
-> bounded release
```

## Deferred Semantic Boundary

`EncumbranceStatus.CONSUMED` remains represented in the canonical enum but is deliberately not executable in M4.

Consumption means converting an active reservation into a live facility position. That requires the Facility/Allocation authority introduced in M5. Implementing it here would invent authority before its owning component exists.

## Verdict

```text
M4 Financeability / Encumbrance: TESTED_TESTNET
```

This evidence does not imply production readiness, mainnet deployment, legal priority over unobserved offchain financing, or facility capitalization.
