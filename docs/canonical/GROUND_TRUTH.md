# Cleara Ground Truth

**Snapshot:** 29 August 2026  
**Status:** M1 verification substrate VERIFIED; M2/M3/M4/M5 TESTED_TESTNET

This file is the highest operational statement of what Cleara can currently prove. Testnet evidence does not imply production, mainnet, legal enforceability, or economic safety beyond the specific tested boundaries.

## Repository

```text
Repository: etvjay/Cleara
Default branch: main
Remote scaffold: live
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

---

# Frozen Semantic Boundaries

```text
CLAIM != PROOF
PROVEN != FINANCIALLY AUTHORIZED
INCLUSION != TRANSACTION SUCCESS
VALID CLAIM != FINANCEABLE CLAIM
BALANCE != CAPITAL COMMITMENT
ALLOCATION != CAPITAL COMMITMENT
RECIPROCITY != SETOFF AUTHORITY
CLEARING != SETTLEMENT
SETTLEMENT INITIATED != SETTLED
DATABASE != CANONICAL FINANCIAL STATE
```

Additional M5 invariant:

```text
allocatedAmount <= encumberedAmount <= facilityTarget
```

Consuming an encumbrance into a facility does not release the claim's active encumbrance. Allocation cancellation restores allocation capacity only; it does not release claim capacity.

---

# M1 — Creditcoin / Attestcoin Verification Substrate

Status: `VERIFIED_CLEARA`

## Creditcoin CC3 Testnet

```text
RPC: https://rpc.cc3-testnet.creditcoin.network
EVM chainId: 102031
G0: PASS
```

## Attestcoin ChainInfo

Cleara live-queried CC3 testnet ChainInfo and observed:

```text
chainKey 1 -> EVM chainId 11155111 -> Ethereum Sepolia
chainKey 3 -> EVM chainId 1        -> Ethereum Mainnet
```

Frozen invariant:

```text
chainKey != EVM chainId
```

## Proof Builder / Block Prover

Verified testnet Proof Builder endpoint:

```text
https://prover.cc3-testnet.creditcoin.network/
```

G2 used real attested Sepolia transaction:

```text
0x8a848420854482e0978b3d6c1345b6a0dfb0263a9620df90ff1a90db18fcbcf6
source block: 11591355
```

G3 result:

```text
valid proof accepted: true
tampered txBytes rejected: true
failure: Merkle proof validation failed
```

Evidence:

```text
GitHub Actions run: 33249132447
Artifact ID: 9713789625
Artifact SHA256: 64394abd8c2382f10c7499d1cb86122d8bd3502a241433307b8a3d1de360cf10
Repository evidence: evidence/runtime/ATTESTCOIN_GATES_2026-08-29.md
```

---

# M2 — Registries

Status: `TESTED_TESTNET`

```text
DomainRegistry
AssetRegistry
EvidenceRegistry
PolicyRegistry
AuthorityRegistry
```

M2 registries were deployed on CC3 as part of the successful M3 evidence run:

```text
DomainRegistry:    0x4fFD44f86362a767644efFf63aD34AfC35AeD005
AssetRegistry:     0xdC0D9D3983465b9Cb8c22e3D7e656bc7C206690d
EvidenceRegistry:  0x153e6ED2303CF5De4Dca4522f41939034e3cb2Ec
PolicyRegistry:    0x2cd6ca928979E5E870D862ee6723f9921798c505
AuthorityRegistry: 0xA8eD6954F0E9B7aB9ba4C71cd420F957b0b6E54B
```

These are evidence deployments, not production contracts.

## Evidence Identity — ADR-0001

Canonical Evidence V2 identity:

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

`txIndex` is proof-native. A caller-supplied conventional source transaction hash is not canonical onchain evidence identity, though offchain bundles may retain it for provenance/navigation.

---

# M3 — Attested Claim Ingestion

Status: `TESTED_TESTNET`

```text
ClaimSource
ClaimRegistry
ClaimASC
INativeQueryVerifier boundary
```

Dependencies exercised:

```text
@gluwa/usc-sdk        0.18.0
@gluwa/usc-contracts  0.2.0
Solidity              0.8.30
Foundry               1.7.1
via_ir                 true
```

## ClaimASC Authority Boundary

ClaimASC is immutable-bound to one:

```text
source chainKey
source domainId
source ClaimSource contract
```

It also consults live domain and asset registries. ClaimASC has no financeability authority.

Acceptance path:

```text
correct chainKey
-> live source-domain authorization
-> derive proof-native txIndex
-> replay check
-> native Block Prover verifyAndEmit
-> decode EVM receipt
-> require receipt.status == 1
-> require exact ClaimCreated event signature
-> require exactly one matching ClaimCreated log
-> require exact source contract
-> decode payload
-> require registered active asset class
-> register Evidence V2
-> register Claim state VERIFIED
```

## M3 Live Evidence

```text
GitHub Actions run: 33253029696
Artifact ID: 9715192463
Artifact SHA256: 27f3eef3050ed96d659630a90b052e87832fbf5ad0df2cc3dcd9879433c1d488
Repository evidence: evidence/runtime/M3_CLAIM_ROUNDTRIP_2026-08-29.md
```

Testnet signers:

```text
Sepolia: 0x04A9351c40748348f4a4e012d21b2Bd775a5d484
CC3:     0x5ac98dc6f8408564645f36195aC0F9c5B1c0C0C8
```

Deployments:

```text
Sepolia ClaimSource: 0xdd013B3423b709bAaC7d2719fCB9d06218Dc2187
CC3 ClaimRegistry:   0x08b3344F24E765e1F61209eEee7d428703F233e9
CC3 ClaimASC:        0x0F6F16983856D5ef7506CFA10e6520B43495c122
WrongSourceASC:      0xcFC354FDD8938943BBF5E6908937C9175A00cf4C
```

Positive path:

```text
Sepolia ClaimCreated tx:
0x4b253921043fc71207a4974d0f98dad1225e0ed878c3a342ed1b2772ff8b9869
source block: 11591891

CC3 ClaimASC acceptance tx:
0x6d08e19ebaf019feb9134e2219168ddd880d592a0f88895cb2b137df47efa1d6

claimId:
0x27c1118eb3ad8a81d585fc0c683f1b0b6727710cb83871e043d2509e171432e7

evidenceId:
0x517a141de1d1a23d0829b573227cf1498b3639b2ec037cfc4f35c450cd33dcaa

ClaimRegistry state: VERIFIED
```

Live negative paths rejected:

```text
proof replay
wrong chainKey
wrong source contract
receipt.status == 0 source transaction
```

Failed source transaction independently proven by Attestcoin but rejected by Cleara semantics:

```text
0x59257e69a97eadbcbe0cc848768610e191f8a3d53cbbd53c6dd3798611de2c2a
source block: 11591939
```

This preserves:

```text
PROVEN != VALID FOR THIS PROTOCOL STATE
INCLUSION != TRANSACTION SUCCESS
```

Attestcoin source verification was observed to be asynchronous. Cleara must not claim total source-to-Creditcoin verification completes in one Creditcoin block.

---

# M4 — Financeability + Encumbrance

Status: `TESTED_TESTNET`

Implemented state primitives:

```text
Claim financeable-capacity controls
EncumbranceRegistry
```

A newly VERIFIED claim starts with:

```text
financeableCapacity = 0
activeEncumbrance   = 0
```

An explicit financeability decision bound to `policyId` and `decisionHash` may move a claim to ACTIVE and set bounded capacity.

Invariant:

```text
activeEncumbrance <= financeableCapacity <= faceValue
availableCapacity = financeableCapacity - activeEncumbrance
```

Encumbrance identity:

```text
keccak256("CLEARA_ENCUMBRANCE_V1", claimId, facilityId, encumbranceNonce)
```

M4 transitions tested before M5:

```text
PROPOSED -> ACTIVE
ACTIVE -> RELEASED
ACTIVE -> CANCELLED
ACTIVE -> EXPIRED
```

M5 now additionally defines:

```text
ACTIVE -> CONSUMED
CONSUMED -> RELEASED   only through explicit facility authority
```

`ACTIVE -> CONSUMED` does not release claim capacity.

## M4 Evidence

```text
Property run: 33254476294
Live CC3 run: 33254529904
Artifact ID: 9715412301
Artifact SHA256: cb0d42256da26ba6f769b9d377dfebf830b0d44a5efafa8b8d36b345537fc940
Repository evidence: evidence/runtime/M4_FINANCEABILITY_2026-08-29.md
```

Evidence deployments:

```text
ClaimRegistry:       0x3b12A365e9beA21035Ab811DA42F04dAfF89e1DC
EncumbranceRegistry: 0x6B1C82122165ec351407ABa272d19daEDE9f7a44
```

Live vector:

```text
faceValue             100,000,000
financeableCapacity    80,000,000
reservation A          50,000,000
available              30,000,000
reservation B request  40,000,000 -> REJECTED
release A              50,000,000
final active                    0
final available        80,000,000
```

M4 live negative paths:

```text
over-reservation
capacity reduction below active encumbrance
double release
```

Build/property evidence reached 22 passing tests, including three M4 fuzz properties at 1,000 cases each.

Evidence boundary: M4 used a directly registered VERIFIED claim fixture. M3 independently proves the Sepolia -> Attestcoin -> ClaimASC -> VERIFIED path. No all-in-one M3->M4 execution is claimed.

---

# M5 — Facility + Allocation

Status: `TESTED_TESTNET`

Implemented components:

```text
FacilityManager
AllocationManager
EncumbranceRegistry facility-consumption boundary
```

Implemented facility lifecycle slice:

```text
NONE -> PROPOSED -> VERIFIED -> OPEN -> ALLOCATING
```

States for `CAPITALIZING`, `CAPITALIZED`, `ACTIVE`, `REPAYING`, `CLOSED`, `EXPIRED`, `CANCELLED`, `DISPUTED`, and `DEFAULTED` remain represented in the canonical enum but are not implied to be fully implemented/tested by this milestone.

Facility identity:

```text
keccak256("CLEARA_FACILITY_V1", sponsor, facilityNonce, policyBundleHash)
```

Allocation identity:

```text
keccak256("CLEARA_ALLOCATION_V1", facilityId, provider, allocationNonce)
```

Implemented allocation lifecycle slice:

```text
NONE -> PROPOSED -> ACTIVE
PROPOSED -> CANCELLED | EXPIRED
ACTIVE -> CANCELLED | EXPIRED
```

`COMMITTED` and `CONSUMED` allocation states are intentionally not executable in M5. They require the capital-commitment authority introduced in M6.

## M5 Authority Boundaries

```text
FacilityManager binds only encumbrances explicitly created for that facility.
Binding an ACTIVE encumbrance moves it to CONSUMED.
Consumed encumbrance continues counting against Claim.activeEncumbrance.
Facility encumberedAmount cannot exceed targetAmount.
Facility allocatedAmount cannot exceed encumberedAmount or targetAmount.
AllocationManager may alter aggregate allocatedAmount only through FacilityManager's role-gated interface.
ACTIVE allocation is not a capital commitment.
```

## M5 Live Evidence

```text
GitHub Actions run: 33256911456
Head exercised: 59a6c8bf30df24297d6e728fbb1afdf1dba08ac1
Artifact ID: 9716144997
Artifact SHA256: 8c2a22ac36cb736c723ebf0b4f90e5309be56f7296e2b5e6135603bde3373c27
Repository evidence: evidence/runtime/M5_FACILITY_ALLOCATION_2026-08-29.md
```

Build/property gate:

```text
forge fmt --check PASS
forge build --sizes PASS
forge test -vvv PASS
30 tests passed
0 failed
0 skipped
```

M5 fuzz properties each passed 1,000 generated cases:

```text
active allocation never exceeds encumbered/target
failed over-allocation does not mutate facility or allocation state
allocation cancellation restores allocation exactly without freeing claim encumbrance
```

Evidence deployments on CC3:

```text
ClaimRegistry:       0x50E03d22fa67Fa1005A1cD626A04B56eaE48E591
EncumbranceRegistry: 0x163c00f3C9A802c3fb47b46263399f491e354Ff9
FacilityManager:     0x92ce1260E35A030580728697667f0F900D514F66
AllocationManager:   0xDDa1DCD9273A8606fCea2b1956287618E1635f53
```

Live objects:

```text
claimId:       0x742efe67731a07a200e5db1b6d5d679c2fb115f705a1cafd97a4751dea0e37db
facilityId:    0x23c14b37336bbed837692c60055be9334df208c25ded77f45023ce9134fce1a0
encumbranceId: 0x5ea05212d67fdd460d47c7ccb2bb8b07471ee23ef53114b554743d7d1df9f3f1
allocationAId: 0x6ed251dee24b6f28afb7b52bdaf4f27cf3f26483bb722fa32fb9cf5028faf0fb
allocationBId: 0x986ee218b5db8e9b169b71a95868694ee32062552407441b52a50f93adf6dcaa
```

Live accounting vector:

```text
claim face value                    100,000,000
financeable capacity                 80,000,000
facility target                      80,000,000
bound/consumed encumbrance           60,000,000
allocation A                         40,000,000
allocation B request                 30,000,000 -> REJECTED
allocated after failed B             40,000,000
allocated after cancelling A                  0
facility encumbered after cancel     60,000,000
claim active encumbrance after cancel60,000,000
claim available capacity             20,000,000
```

Live semantic check:

```text
AllocationStatus.ACTIVE    = 2
AllocationStatus.COMMITTED = 3
observed allocation A      = 2
allocationDidNotBecomeCommitment = true
```

Live negative paths:

```text
over-allocation rejected
failed activation did not mutate facility allocatedAmount
failed allocation remained PROPOSED
double cancellation rejected
```

Important evidence boundary: M5 used a directly registered VERIFIED claim fixture to isolate facility/allocation semantics. M3 and M4 remain independent evidence bundles. Cleara does not yet claim a single uninterrupted Sepolia -> Attestcoin -> financeability -> facility -> allocation execution.

---

# Workflow Security State

M3, M4, and M5 live workflows are restored to:

```text
workflow_dispatch only
permissions: contents read
environment: testnet
```

Temporary exact-path push triggers were used solely because the connected GitHub execution interface could not dispatch manual workflows. They were removed after execution, and trigger files were deleted.

The `testnet` environment uses throwaway testnet deployer credentials. These are not production credentials.

---

# Not Yet Implemented / Verified

The following remain `NOT_STARTED` unless separately stated elsewhere:

```text
CapitalCommitmentVault
CommitmentASC
CommitmentRegistry
facility capitalization transition
facility ACTIVE financing lifecycle
ObligationLedger
ClearingEngine
ResidualLedger
SettlementRouter
SettlementAdapter
SettlementASC
SettlementReconciler
workers
indexer/database projections
public API
frontend
Wormhole residual settlement integration
Credal integration
```

No capital commitment has been recognized.

No facility has been capitalized.

No lender allocation has been represented as locked capital.

No drawdown has occurred.

No financial obligation has been formed or cleared.

No residual settlement has been executed or reconciled.

No Cleara mainnet deployment exists.

No production deployment exists.

---

# Next Authorized Milestone

M5 has passed its local unit/property gates and live CC3 facility/allocation evidence gate.

The next canonical milestone is:

```text
M6 Capital Commitment
```

M6 must introduce:

```text
CapitalCommitmentVault on the source chain
CommitmentASC on Creditcoin
CommitmentRegistry on Creditcoin
proof that committed capital is locally constrained where it lives
binding from ACTIVE allocation to VERIFIED/ACTIVE capital commitment
```

M6 must preserve:

```text
BALANCE != CAPITAL COMMITMENT
ALLOCATION != CAPITAL COMMITMENT
ATTESTED COMMIT EVENT != CURRENTLY ACTIVE COMMITMENT without lifecycle evidence
PROVEN != VALID FOR THIS FACILITY
```

Facility capitalization must remain impossible until actual capital commitments have been verified and matched to the facility/allocation state.

---

# Public Claim Allowed Now

> Cleara has testnet-tested four connected financial-state boundaries: real Sepolia claim evidence can be proven through Attestcoin and registered as a VERIFIED claim on Creditcoin; Creditcoin contracts can assign bounded financeable capacity and prevent over-encumbrance; a facility can consume that encumbrance without releasing the underlying claim capacity; and provider allocations can be coordinated against the facility without being mistaken for committed capital. These boundaries have separate evidence runs and must not be represented as one uninterrupted production flow. Capital commitments, capitalization, obligations, clearing, and settlement are not yet implemented.
