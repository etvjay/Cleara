# M6 Capital Commitment — Live Testnet Evidence

Date: 29 August 2026
Status: PASS
Milestone: M6 Capital Commitment

## Execution

GitHub Actions run: `33261468561`
Head exercised: `b2f1fd14bbaaec7f513ff477e747e14494df7ffc`
Artifact ID: `9717582867`
Artifact SHA256: `07a3ca2c04c9e61d44d52ffd8d9e1b424f45f5f267a7d3521b0249c04f58f1c7`

Build/property gate:

```text
forge fmt --check PASS
forge build --sizes PASS
forge test -vvv PASS
34 tests passed
0 failed
0 skipped
```

## Networks

```text
Sepolia chainId: 11155111
CC3 chainId:     102031
Sepolia signer:  0x04A9351c40748348f4a4e012d21b2Bd775a5d484
CC3 signer:      0x5ac98dc6f8408564645f36195aC0F9c5B1c0C0C8
```

## Evidence Deployments

### Sepolia

```text
MockERC20:               0x3AB76d450384017FCe4e4924f8b1f687E8341e6D
CapitalCommitmentVault:  0x772F05EaafbddF8359CF6199842522e8436369a7
```

### Creditcoin CC3

```text
DomainRegistry:        0xbacbFb9F2D9C836C7e4A5295E0033249181F1a44
AssetRegistry:         0xdB3d4cD9A1d486423d75Fd85822546c418DC11bD
EvidenceRegistry:      0x6709B3F718D5393D8e4cEA0A14B024B3Db7Fdbb1
ClaimRegistry:         0xc3E76857E1711659Fd0b22dDB617d26172974579
EncumbranceRegistry:   0xD5cC1Fda546C18759Ebb2892B6E568601fF1837D
FacilityManager:       0x0945aEa515427E2DC57954F4C3d48881adDbab97
AllocationManager:     0x950C12Ddd224F17E39953b4D70e1855aB8ffCCcF
CommitmentRegistry:    0x435594014cFd129ae58EeafbF61e962da1123807
CommitmentASC:         0x3C09f922E5F54f46920D548fdb39927b1B418CC9
```

## Objects

```text
claimId:
0x8941d095f1b21a657f5c84dacb65ec42f35ebdfa465d0586e9cf820a93e36146

facilityId:
0xd4b76e8d09e1e923767e16993489d7086e71e2baecd4f803e1a5eecbf1f445aa

encumbranceId:
0x4d774d3106cecbef043ac4270fca6edd76369ca2c70e935741b2d92b69cd6262

allocationId:
0xfb92022098e2f22a5ba14ea3209e92249adbe8280941dcf752c5f0a9b252b68c

sourceCommitmentId:
0xff20c2ded3a4e4e72048ba2ab59c89b817b8e2d7e62d0c10dd3d9628c5f2c2ca

commitmentId:
0x1c6eac58a0624da33eb0cf31cf89e60892f43d12d64d9f31d4fa871141194149

evidenceId:
0xd0b780acfa1e73b4a49bf881025a8d8e6a8384373fc1b3dcdda647d29f7a8253

assetClassId:
0xbac9934fc7cfa310c97869ae654dee15a77e301397faae4f8f80dffb4c5f9ad2

representationId:
0xfe7a439c6168911e764d3c533f94d680d955e032a3f7fa69e3dd243849ece915
```

## Source Commitment

Sepolia transaction:

```text
0x34654a3907716ab2d597783aab6cb5b48fdc89d08b501b40dd41c838f3481ef0
block: 11592858
amount: 1,000,000
vaultBalance after commit: 1,000,000
source commitment status: COMMITTED
```

The source provider's capital was transferred into `CapitalCommitmentVault`; the evidence therefore represents constrained source-chain capital rather than a wallet balance assertion.

## Attestcoin Observation

The source transaction at block `11592858` waited for sparse Attestcoin checkpoints. The Proof Builder reported attested heights progressing from approximately `11592820` through `11592850` before the commitment became provable.

This confirms again:

```text
source transaction inclusion -> Attestcoin availability is asynchronous
```

## Creditcoin Result

After the Attestcoin proof was accepted by `CommitmentASC`:

```text
AllocationStatus: COMMITTED
CommitmentStatus: ACTIVE
Facility committedAmount: 1,000,000
FacilityStatus: CAPITALIZED
```

The M6 fixture had target/allocation/encumbrance equal to the committed amount, so the existing thin capitalization gate was able to finalize.

## Negative Path

```text
replay of the same commitment proof -> REJECTED
```

## Proven Semantic Boundary

M6 proves the following boundary on testnet:

```text
ACTIVE allocation
-> source ERC-20 transferred into CapitalCommitmentVault
-> CapitalCommitted source event
-> Attestcoin proof
-> CommitmentASC semantic validation
-> CommitmentRegistry ACTIVE
-> Allocation COMMITTED
-> facility committedAmount increased
```

It therefore supports:

```text
BALANCE != CAPITAL COMMITMENT
ALLOCATION != CAPITAL COMMITMENT
PROVEN COMMIT EVENT != VALID COMMITMENT unless facility/allocation/asset/provider/source semantics match
```

## Limitations

- The prerequisite claim/facility/allocation objects were created directly on CC3 to isolate the M6 commitment boundary.
- This is not yet one uninterrupted M3 -> M4 -> M5 -> M6 execution.
- M6 proves the `CapitalCommitted` event, not perpetual current vault state.
- Commitment lifecycle synchronization for later `CONSUMED`, `RELEASED`, or `EXPIRED` source states remains to be implemented.
- Multiparty capitalization composition is not proven by this one-provider run.
- No drawdown or financial obligation was created.
- These are testnet evidence deployments, not production contracts.
