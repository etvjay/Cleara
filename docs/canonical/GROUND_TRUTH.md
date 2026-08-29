# Cleara Ground Truth

**Snapshot:** 29 August 2026  
**Operational status:** M1 `VERIFIED_CLEARA`; M2-M6 `TESTED_TESTNET`; M7 `IMPLEMENTED_LOCAL` with live multiparty evidence in progress.

This document is the highest operational statement of what Cleara can currently prove. No testnet result implies production safety, mainnet readiness, legal enforceability, economic finality, or audit completion.

## Repository

```text
Repository: etvjay/Cleara
Default branch: main
Network focus: Creditcoin CC3 testnet + Ethereum Sepolia
```

## Status Vocabulary

```text
VERIFIED_CLEARA
IMPLEMENTED_LOCAL
TESTED_TESTNET
NOT_STARTED
NOT_VERIFIED
FUTURE
FORBIDDEN_CLAIM
```

## Frozen Semantic Boundaries

```text
CLAIM != PROOF
PROVEN != FINANCIALLY AUTHORIZED
INCLUSION != TRANSACTION SUCCESS
VALID CLAIM != FINANCEABLE CLAIM
BALANCE != CAPITAL COMMITMENT
ALLOCATION != CAPITAL COMMITMENT
PROVEN COMMIT EVENT != PERPETUAL CURRENT COMMITMENT
ECONOMIC EQUIVALENCE != EXECUTION EQUIVALENCE
RECIPROCITY != SETOFF AUTHORITY
CLEARING != SETTLEMENT
SETTLEMENT INITIATED != SETTLED
DATABASE != CANONICAL FINANCIAL STATE
```

Current accounting invariants:

```text
activeEncumbrance <= financeableCapacity <= faceValue
committedAmount <= allocatedAmount <= encumberedAmount <= targetAmount
```

Consumed encumbrance continues counting against claim capacity. Allocation cancellation does not release claim capacity. Only verified externally constrained capital may increase committed capital.

---

# M1 — Creditcoin / Attestcoin Verification Substrate

Status: `VERIFIED_CLEARA`

Verified live on CC3:

```text
Creditcoin CC3 chainId: 102031
Attestcoin chainKey 1: Sepolia / EVM chainId 11155111
Attestcoin chainKey 3: Ethereum Mainnet / EVM chainId 1
Proof Builder: https://prover.cc3-testnet.creditcoin.network/
Block Prover: 0x0000000000000000000000000000000000000FD2
```

Evidence:

```text
Run: 33249132447
Artifact: 9713789625
SHA256: 64394abd8c2382f10c7499d1cb86122d8bd3502a241433307b8a3d1de360cf10
```

A real attested Sepolia transaction proof was generated and accepted; tampered transaction bytes were rejected.

Frozen:

```text
chainKey != EVM chainId
Attestcoin availability is asynchronous
```

---

# M2 — Registries

Status: `TESTED_TESTNET`

Implemented:

```text
DomainRegistry
AssetRegistry
EvidenceRegistry
PolicyRegistry
AuthorityRegistry
```

ADR-0001 canonical Evidence V2 identity:

```text
keccak256(
  "CLEARA_EVIDENCE_V2",
  domainId,
  chainKey,
  blockHeight,
  txIndex,
  eventIndex
)
```

Caller-supplied conventional transaction hash is provenance metadata, not canonical evidence identity.

M2 registries were exercised as live CC3 dependencies in the M3 round trip.

---

# M3 — Attested Claim Ingestion

Status: `TESTED_TESTNET`

Implemented:

```text
ClaimSource
ClaimRegistry
ClaimASC
```

Acceptance boundary:

```text
correct chainKey
-> active authorized source domain
-> proof-native replay identity
-> Block Prover verification
-> receipt.status == 1
-> exact source ClaimSource
-> exact ClaimCreated event semantics
-> registered active asset class
-> Evidence V2
-> ClaimRegistry VERIFIED
```

Live evidence:

```text
Run: 33253029696
Artifact: 9715192463
SHA256: 27f3eef3050ed96d659630a90b052e87832fbf5ad0df2cc3dcd9879433c1d488
Evidence: evidence/runtime/M3_CLAIM_ROUNDTRIP_2026-08-29.md
```

Key deployments:

```text
Sepolia ClaimSource: 0xdd013B3423b709bAaC7d2719fCB9d06218Dc2187
CC3 ClaimRegistry:   0x08b3344F24E765e1F61209eEee7d428703F233e9
CC3 ClaimASC:        0x0F6F16983856D5ef7506CFA10e6520B43495c122
```

Rejected live:

```text
proof replay
wrong chainKey
wrong source contract
proven source transaction with receipt.status == 0
```

Therefore:

```text
PROVEN != VALID FOR THIS PROTOCOL STATE
INCLUSION != TRANSACTION SUCCESS
```

---

# M4 — Financeability + Encumbrance

Status: `TESTED_TESTNET`

Implemented:

```text
Claim financeable capacity
EncumbranceRegistry
```

Invariant:

```text
activeEncumbrance <= financeableCapacity <= faceValue
availableCapacity = financeableCapacity - activeEncumbrance
```

Evidence:

```text
Run: 33254529904
Artifact: 9715412301
SHA256: cb0d42256da26ba6f769b9d377dfebf830b0d44a5efafa8b8d36b345537fc940
Evidence: evidence/runtime/M4_FINANCEABILITY_2026-08-29.md
```

Live vector proved over-encumbrance rejection, inability to cut capacity below an active reservation, and exact-once release. Three M4 fuzz properties passed 1,000 runs each.

---

# M5 — Facility + Allocation

Status: `TESTED_TESTNET`

Implemented:

```text
FacilityManager
AllocationManager
ACTIVE -> CONSUMED encumbrance binding
```

Invariant:

```text
allocatedAmount <= encumberedAmount <= targetAmount
```

Evidence:

```text
Run: 33256911456
Artifact: 9716144997
SHA256: 8c2a22ac36cb736c723ebf0b4f90e5309be56f7296e2b5e6135603bde3373c27
Evidence: evidence/runtime/M5_FACILITY_ALLOCATION_2026-08-29.md
```

Live semantics proved:

```text
ACTIVE allocation != COMMITTED capital
over-allocation rejects atomically
allocation cancellation restores allocation accounting
allocation cancellation does not free claim encumbrance
```

Three M5 fuzz properties passed 1,000 runs each.

---

# M6 — Capital Commitment

Status: `TESTED_TESTNET`

Implemented:

```text
CapitalCommitmentVault
CommitmentASC
CommitmentRegistry
AllocationManager ACTIVE -> COMMITTED binding
FacilityManager committedAmount accounting
```

Source-chain meaning:

```text
provider approves ERC20
-> CapitalCommitmentVault.safeTransferFrom
-> provider loses unilateral access to committed amount
-> CapitalCommitted event
```

Creditcoin meaning:

```text
CapitalCommitted event
-> Attestcoin proof
-> exact domain/chainKey/vault validation
-> receipt.status == 1
-> exact asset representation
-> exact facility/allocation/provider/amount/asset/expiry match
-> CommitmentRegistry ACTIVE
-> Allocation COMMITTED
-> facility committedAmount increases
```

Evidence:

```text
Run: 33261468561
Artifact: 9717582867
SHA256: 07a3ca2c04c9e61d44d52ffd8d9e1b424f45f5f267a7d3521b0249c04f58f1c7
Evidence: evidence/runtime/M6_CAPITAL_COMMITMENT_2026-08-29.md
```

Source evidence:

```text
Sepolia token: 0x3AB76d450384017FCe4e4924f8b1f687E8341e6D
Sepolia vault: 0x772F05EaafbddF8359CF6199842522e8436369a7
Commit tx: 0x34654a3907716ab2d597783aab6cb5b48fdc89d08b501b40dd41c838f3481ef0
Source block: 11592858
Committed amount: 1,000,000
Observed vault balance: 1,000,000
Source state: COMMITTED
```

CC3 evidence deployments:

```text
FacilityManager:    0x0945aEa515427E2DC57954F4C3d48881adDbab97
AllocationManager:  0x950C12Ddd224F17E39953b4D70e1855aB8ffCCcF
CommitmentRegistry: 0x435594014cFd129ae58EeafbF61e962da1123807
CommitmentASC:      0x3C09f922E5F54f46920D548fdb39927b1B418CC9
```

Observed result:

```text
AllocationStatus: COMMITTED
CommitmentStatus: ACTIVE
committedAmount: 1,000,000
replay: REJECTED
```

The M6 test fixture also exercised the then-thin `CAPITALIZED` state because target/allocation/encumbrance/commitment were all 1,000,000. This does not substitute for M7's capitalization-set semantics.

M6 limitation:

```text
CapitalCommitted at T0 proves source capital was constrained at T0.
It does not prove the capital remains constrained forever.
```

Source lifecycle synchronization for `CONSUMED`, `RELEASED`, and `EXPIRED` remains a future requirement before production claims.

---

# M7 — Multiparty Capitalization Seal

Status: `IMPLEMENTED_LOCAL`

Live evidence run: `33274674575` — in progress at this snapshot.

Implemented:

```text
CapitalizationManager
one-time FacilityManager capitalization-authority binding
capitalizationRoot
capitalRequiredUntil
capitalizationCommitmentCount
capitalizedAt
MAX_COMMITMENTS = 10
```

Canonical capitalization root:

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
facility.status == CAPITALIZING
allocatedAmount == targetAmount
committedAmount == targetAmount
encumberedAmount >= targetAmount
commitment set non-empty and <= 10
commitment IDs strictly increasing
all commitments ACTIVE
all commitments belong to facility
all commitment asset classes match facility
all commitments expire >= capitalRequiredUntil
matching allocations are COMMITTED
matching allocation provider == commitment provider
matching allocation amount == commitment amount
sum(commitment amounts) == targetAmount
```

Authority boundary:

```text
FacilityManager.bindCapitalizationManager can succeed once.
Ordinary FACILITY_MANAGER_ROLE cannot finalize capitalization.
Only the bound CapitalizationManager can write the capitalization seal and transition CAPITALIZING -> CAPITALIZED.
```

Local evidence:

```text
Run: 33274576602
42 tests passed
0 failed
0 skipped
```

M7-specific fuzz properties, each 1,000 runs:

```text
arbitrary exact three-provider splits seal and conserve target
short-horizon member cannot mutate the capitalization seal
duplicate commitment membership cannot seal
```

The active live M7 experiment uses three ephemeral Sepolia provider wallets and the split:

```text
400,000 + 350,000 + 250,000 = 1,000,000 target
```

The ephemeral provider private keys exist only within the Actions runner and are neither stored as repository secrets nor emitted as evidence.

M7 is not `TESTED_TESTNET` until the live run completes, evidence is inspected, and the status is explicitly promoted.

---

# Not Yet Implemented / Not Yet Proven

```text
M7 live multiparty capitalization promotion
commitment lifecycle synchronization after source consume/release/expiry
M8 ObligationLedger
M9 ClearingEngine / ClearingEpoch
M10 ResidualLedger / SettlementRouter
M11 SettlementAdapter / SettlementASC / reconciliation
M12 durable workers
M13 production indexer
M14 application API
M15 product frontend
M16 Wormhole residual-settlement integration
M17 hardening / audit / production governance
mainnet Cleara deployment
production-value operation
```

Writability remains `FUTURE` and is not an MVP dependency.

---

# Current Evidence Boundary

Cleara has separately proven on testnet:

```text
M3: Sepolia claim -> Attestcoin -> VERIFIED claim
M4: VERIFIED fixture -> financeable capacity -> bounded encumbrance
M5: encumbrance -> facility -> provider allocation
M6: externally locked Sepolia capital -> Attestcoin -> ACTIVE commitment
```

Cleara does not yet claim that M3-M6 were executed as one uninterrupted end-to-end financial workflow against one shared deployment set.

---

# Allowed Public Claim

Current strongest allowed claim:

> Cleara has testnet evidence for Attestcoin-backed claim ingestion, bounded financeability and encumbrance, facility/allocation coordination, and externally constrained Sepolia capital commitments recognized on Creditcoin. Multiparty capitalization sealing is implemented and under live testnet validation.

Forbidden current claims include:

```text
production ready
audited
mainnet deployed
legally enforceable receivables
live production lenders or borrowers
source lifecycle synchronization complete
multiparty capitalization testnet-proven until M7 live evidence passes
obligations implemented
clearing implemented
bridge reduction measured in production
Wormhole integrated
Credal integrated
Writability live dependency
Base or Arbitrum Attestcoin source support
```

---

# Current Frontier

```text
M1  VERIFIED_CLEARA
M2  TESTED_TESTNET
M3  TESTED_TESTNET
M4  TESTED_TESTNET
M5  TESTED_TESTNET
M6  TESTED_TESTNET
M7  IMPLEMENTED_LOCAL / LIVE_EVIDENCE_RUNNING
M8  NOT_STARTED
```

Rule:

> Cleara must never know more on paper than it can prove in reality.
