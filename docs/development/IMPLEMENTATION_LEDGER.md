# Cleara Implementation Ledger

Snapshot: 29 August 2026

| Component | Specification | Implementation | Tests | Live Evidence | Audit | Deployment |
|---|---|---|---|---|---|---|
| M0 Repository scaffold | Frozen | COMPLETE | Static/bootstrap checks | GitHub main | Not started | GitHub |
| M1 Creditcoin/Attestcoin substrate | Frozen | VERIFIED_CLEARA | G0-G3 PASS | Run 33249132447 / artifact 9713789625 | Not started | N/A |
| M2 Registries | Frozen + ADR-0001 | TESTED_TESTNET | Registry suite PASS | Exercised in M3 | Not started | CC3 evidence deployments |
| M3 Attested claim ingestion | Frozen | TESTED_TESTNET | Positive + negative claim paths PASS | Run 33253029696 / artifact 9715192463 | Not started | Sepolia + CC3 evidence deployments |
| M4 Financeability/Encumbrance | Frozen | TESTED_TESTNET | Unit + 3x1000 fuzz + live PASS | Run 33254529904 / artifact 9715412301 | Not started | CC3 evidence deployments |
| M5 Facility/Allocation | Frozen | TESTED_TESTNET | Unit + 3x1000 fuzz + live PASS | Run 33256911456 / artifact 9716144997 | Not started | CC3 evidence deployments |
| M6 CapitalCommitmentVault | Frozen M6 slice | TESTED_TESTNET | ERC20 custody + early escape rejection PASS | Run 33261468561 / artifact 9717582867 | Not started | Sepolia evidence deployment |
| M6 CommitmentASC/Registry | Frozen M6 slice | TESTED_TESTNET | semantic validation + replay PASS | Run 33261468561 / artifact 9717582867 | Not started | CC3 evidence deployments |
| M6 allocation→commitment binding | Frozen M6 slice | TESTED_TESTNET | ACTIVE→COMMITTED + facility committed accounting PASS | `evidence/runtime/M6_CAPITAL_COMMITMENT_2026-08-29.md` | Not started | Sepolia + CC3 evidence deployments |
| M7 CapitalizationManager | Frozen implementation slice | IMPLEMENTED_LOCAL | unit + 3x1000 M7 fuzz PASS | Live run 33274674575 IN_PROGRESS | Not started | Local/CI only until live pass |
| M7 Facility capitalization seal | Frozen implementation slice | IMPLEMENTED_LOCAL | one-time authority/root/horizon/membership tests PASS | Live run 33274674575 IN_PROGRESS | Not started | Local/CI only until live pass |
| Canonical docs/skills mirror | Frozen | PARTIAL_REMOTE_MIRROR | N/A | Local canonical package exists | Not started | GitHub main partial |

## M1 — Verification substrate

```text
Run: 33249132447
Artifact: 9713789625
SHA256: 64394abd8c2382f10c7499d1cb86122d8bd3502a241433307b8a3d1de360cf10
```

Verified live:

```text
CC3 chainId 102031
ChainInfo source chainKey 1 -> Sepolia
ChainInfo source chainKey 3 -> Ethereum Mainnet
real Sepolia proof generated
valid Block Prover verification accepted
tampered proof rejected
```

## M3 — Attested claim ingestion

```text
Run: 33253029696
Artifact: 9715192463
SHA256: 27f3eef3050ed96d659630a90b052e87832fbf5ad0df2cc3dcd9879433c1d488
Evidence: evidence/runtime/M3_CLAIM_ROUNDTRIP_2026-08-29.md
```

Proven boundary:

```text
Sepolia ClaimCreated
-> Attestcoin
-> ClaimASC semantic validation
-> ClaimRegistry VERIFIED
```

Rejected live:

```text
replay
wrong chainKey
wrong source contract
receipt.status == 0
```

## M4 — Financeability/Encumbrance

```text
Run: 33254529904
Artifact: 9715412301
SHA256: cb0d42256da26ba6f769b9d377dfebf830b0d44a5efafa8b8d36b345537fc940
Evidence: evidence/runtime/M4_FINANCEABILITY_2026-08-29.md
```

Invariant:

```text
activeEncumbrance <= financeableCapacity <= faceValue
```

Live vector proved bounded reservation, over-reservation rejection, capacity-floor enforcement and exact-once release.

## M5 — Facility/Allocation

```text
Run: 33256911456
Artifact: 9716144997
SHA256: 8c2a22ac36cb736c723ebf0b4f90e5309be56f7296e2b5e6135603bde3373c27
Evidence: evidence/runtime/M5_FACILITY_ALLOCATION_2026-08-29.md
```

Invariant:

```text
allocatedAmount <= encumberedAmount <= targetAmount
```

Proven semantic boundary:

```text
ALLOCATION != CAPITAL COMMITMENT
```

Consumed encumbrance continues counting against claim capacity; allocation cancellation does not free claim capacity.

## M6 — Capital Commitment

Status: `TESTED_TESTNET`

```text
Run: 33261468561
Head exercised: b2f1fd14bbaaec7f513ff477e747e14494df7ffc
Artifact: 9717582867
SHA256: 07a3ca2c04c9e61d44d52ffd8d9e1b424f45f5f267a7d3521b0249c04f58f1c7
Evidence: evidence/runtime/M6_CAPITAL_COMMITMENT_2026-08-29.md
```

Source evidence deployment:

```text
MockERC20:              0x3AB76d450384017FCe4e4924f8b1f687E8341e6D
CapitalCommitmentVault: 0x772F05EaafbddF8359CF6199842522e8436369a7
```

CC3 evidence deployments:

```text
DomainRegistry:      0xbacbFb9F2D9C836C7e4A5295E0033249181F1a44
AssetRegistry:       0xdB3d4cD9A1d486423d75Fd85822546c418DC11bD
EvidenceRegistry:    0x6709B3F718D5393D8e4cEA0A14B024B3Db7Fdbb1
ClaimRegistry:       0xc3E76857E1711659Fd0b22dDB617d26172974579
EncumbranceRegistry: 0xD5cC1Fda546C18759Ebb2892B6E568601fF1837D
FacilityManager:     0x0945aEa515427E2DC57954F4C3d48881adDbab97
AllocationManager:   0x950C12Ddd224F17E39953b4D70e1855aB8ffCCcF
CommitmentRegistry:  0x435594014cFd129ae58EeafbF61e962da1123807
CommitmentASC:       0x3C09f922E5F54f46920D548fdb39927b1B418CC9
```

Live source commitment:

```text
tx: 0x34654a3907716ab2d597783aab6cb5b48fdc89d08b501b40dd41c838f3481ef0
block: 11592858
amount: 1,000,000
vault balance: 1,000,000
source state: COMMITTED
```

CC3 result:

```text
AllocationStatus: COMMITTED
CommitmentStatus: ACTIVE
committedAmount: 1,000,000
thin M6 facility state: CAPITALIZED
replay: REJECTED
```

M6 therefore proves:

```text
BALANCE != CAPITAL COMMITMENT
ALLOCATION != CAPITAL COMMITMENT
source capital constrained in vault
-> Attestcoin proof
-> semantic validation
-> recognized ACTIVE commitment
```

Limitation: the source `CapitalCommitted` event proves a lock at that historical point. It does not prove perpetual current vault state. Lifecycle synchronization remains required.

## M7 — Capitalization seal

Status: `IMPLEMENTED_LOCAL`; live evidence gate running.

Implemented:

```text
CapitalizationManager
FacilityManager one-time capitalization authority binding
capitalRequiredUntil
capitalizationRoot
capitalizationCommitmentCount
sealedAt/capitalizedAt metadata
strictly ordered commitment membership
MAX_COMMITMENTS = 10
```

Root:

```text
keccak256(abi.encode(
  "CLEARA_CAPITALIZATION_V1",
  facilityId,
  assetClassId,
  policyBundleHash,
  capitalRequiredUntil,
  sortedCommitmentIds
))
```

Seal requirements:

```text
facility status == CAPITALIZING
allocatedAmount == targetAmount
committedAmount == targetAmount
encumberedAmount >= targetAmount
all commitments ACTIVE
all commitments belong to facility
all commitments use facility asset class
all commitments expire >= capitalRequiredUntil
matching allocations are COMMITTED
matching provider + amount
strictly ordered unique commitment IDs
sum(commitments) == targetAmount
```

Authority:

```text
FacilityManager capitalizationManager can be bound once.
Ordinary FACILITY_MANAGER_ROLE cannot finalize capitalization.
CapitalizationManager is the sole finalization surface after binding.
```

Latest local CI before live evidence:

```text
Run: 33274576602
42 tests passed
0 failed
0 skipped
M7 fuzz: 3 properties x 1000 runs PASS
```

M7 live evidence run:

```text
Run: 33274674575
Status at ledger update: IN_PROGRESS
Design: three ephemeral Sepolia provider wallets, 400k + 350k + 250k = 1,000,000 target
```

Ephemeral provider private keys exist only in the GitHub Actions runner and are neither repository secrets nor evidence output.

## Current Frontier

```text
M1 VERIFIED_CLEARA
M2 TESTED_TESTNET
M3 TESTED_TESTNET
M4 TESTED_TESTNET
M5 TESTED_TESTNET
M6 TESTED_TESTNET
M7 IMPLEMENTED_LOCAL / LIVE_EVIDENCE_RUNNING
M8 NOT_STARTED
```

M8 Financial Obligations must not begin until M7's live multiparty capitalization evidence passes and Ground Truth is promoted.
