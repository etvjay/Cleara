# Cleara Ground Truth

**Snapshot:** 29 August 2026  
**Operational status:** M1 `VERIFIED_CLEARA`; M2-M8 `TESTED_TESTNET`; M9 `NOT_STARTED`.

This document is the highest operational statement of what Cleara can currently prove. No testnet result implies production safety, mainnet readiness, legal enforceability, economic finality, or audit completion.

## Repository

```text
Repository: etvjay/Cleara
Default branch: main
Network focus: Creditcoin CC3 testnet + Ethereum Sepolia
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
CAPITALIZED != committedAmount == target alone
OBLIGATION != PAYMENT INSTRUCTION
FINALIZED OBLIGATION != CLEARING ELIGIBILITY
FINALIZED OBLIGATION != SETTLED VALUE
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
obligation.clearedAmount + obligation.settledAmount <= obligation.originalAmount
```

The third invariant is structurally prepared but no M8 method can yet increase `clearedAmount` or `settledAmount`; those authorities belong to later milestones.

# Milestone Status

```text
M1 Creditcoin / Attestcoin verification substrate  VERIFIED_CLEARA
M2 Registries                                      TESTED_TESTNET
M3 Attested Claim Ingestion                        TESTED_TESTNET
M4 Financeability + Encumbrance                    TESTED_TESTNET
M5 Facility + Allocation                           TESTED_TESTNET
M6 Capital Commitment                              TESTED_TESTNET
M7 Multiparty Capitalization Seal                  TESTED_TESTNET
M8 ObligationLedger                                TESTED_TESTNET
M9 ClearingEngine / ClearingEpoch                  NOT_STARTED
```

## M1 — Verification Substrate

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

## M2 — Registries

Implemented and exercised on CC3:

```text
DomainRegistry
AssetRegistry
EvidenceRegistry
PolicyRegistry
AuthorityRegistry
```

Canonical Evidence V2 identity:

```text
keccak256("CLEARA_EVIDENCE_V2", domainId, chainKey, blockHeight, txIndex, eventIndex)
```

## M3 — Attested Claim Ingestion

Status: `TESTED_TESTNET`

Evidence:

```text
Run: 33253029696
Artifact: 9715192463
SHA256: 27f3eef3050ed96d659630a90b052e87832fbf5ad0df2cc3dcd9879433c1d488
Evidence: evidence/runtime/M3_CLAIM_ROUNDTRIP_2026-08-29.md
```

Live negative paths rejected proof replay, wrong chainKey, wrong source contract, and a proven failed source transaction (`receipt.status == 0`).

## M4 — Financeability + Encumbrance

Status: `TESTED_TESTNET`

Evidence:

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

## M5 — Facility + Allocation

Status: `TESTED_TESTNET`

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

## M6 — Capital Commitment

Status: `TESTED_TESTNET`

Evidence:

```text
Run: 33261468561
Artifact: 9717582867
SHA256: 07a3ca2c04c9e61d44d52ffd8d9e1b424f45f5f267a7d3521b0249c04f58f1c7
Evidence: evidence/runtime/M6_CAPITAL_COMMITMENT_2026-08-29.md
```

M6 proved:

```text
source ERC20 transferred into CapitalCommitmentVault
-> CapitalCommitted
-> Attestcoin proof
-> CommitmentASC semantic validation
-> CommitmentRegistry ACTIVE
-> Allocation COMMITTED
-> facility committedAmount increased
```

M6 limitation remains:

```text
CapitalCommitted at T0 does not prove perpetual source-chain constraint.
```

## M7 — Multiparty Capitalization Seal

Status: `TESTED_TESTNET`

Evidence:

```text
Run: 33274674575
Head exercised: e869ae45688fcfd0a09d5c92038323491b3cf8ba
Artifact: 9721384433
SHA256: 76d92928df25c366faf03165764b94ecf2c82e8a45f80643996d79b20a6731a2
Evidence: evidence/runtime/M7_MULTIPARTY_CAPITALIZATION_2026-08-29.md
```

Build/property gate:

```text
42 tests passed
0 failed
0 skipped
3 M7 fuzz properties x 1000 cases PASS
```

Live source composition:

```text
Provider A  400,000  0x8766760e375bD43f600D23C40aDCeeDD62a60e2b
Provider B  350,000  0x9c97121F58967a5D4E060467aa4ec704A4c20D8c
Provider C  250,000  0xA4498B69683178ab46133BEc4A140de670A0C2D2
                    ---------
Target             1,000,000
```

Final M7 CC3 state:

```text
FacilityManager: 0xa9662e17409976Cc2886404394ab8714E7bC7224
facilityId: 0x772ed1527b2137634f30da4dd62245906719b697dc7ca0bd27e11a8a2d5c7a73
FacilityStatus: CAPITALIZED
encumberedAmount: 1,000,000
allocatedAmount:  1,000,000
committedAmount:  1,000,000
commitmentCount:  3
capitalizationRoot:
0x1ca109babcb91c33eb6124d1693b27fe6d9397cfa0730e56ce765feb3ae0f512
capitalRequiredUntil: 1788123587
```

Live negative paths rejected direct FacilityManager capitalization bypass, duplicate commitment set, invalid capital horizon, and reseal.

M7 establishes:

```text
CAPITALIZED == validated + horizon-safe + immutable commitment composition
```

## M8 — Obligation Ledger

Status: `TESTED_TESTNET`

Evidence:

```text
Run: 33280253700
Head exercised: 1a49c9db3897c1de52adce588fb15d1064c9f187
Artifact: 9722789518
SHA256: 89b53706a08a8e9af4b91be6e76c12436cd1fb4ec46a52ed7574f91bd2123c44
Evidence: evidence/runtime/M8_OBLIGATIONS_2026-08-29.md
```

Build/property gate:

```text
51 tests passed
0 failed
0 skipped
3 M8 fuzz properties x 1000 cases PASS
```

M8 did not create a new synthetic capitalization fixture. It deployed `ObligationLedger` against the actual live M7 `FacilityManager` and rechecked the exact M7 facility, asset class, capitalization root, accounting, and unexpired capital horizon before issuing any obligation.

Live deployment:

```text
ObligationLedger:
0x8F70ef4A83eb04fa6f303F0d80031f2aA3741b39
```

M8 live vector:

```text
Provider A -> Facility sponsor  400,000
Provider B -> Facility sponsor  350,000
Provider C -> Facility sponsor  250,000
                              ---------
Finalized drawdown obligations 1,000,000
```

The providers are debtors and the M7 facility sponsor is creditor because the obligations represent drawdown rights backed by the already committed capital. M8 does not fabricate repayment obligations before drawdown.

Canonical obligation identity:

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

Live obligations:

```text
nonce 0
id 0x330647cb907ce83563e27d406c3c3789b2756705ff4cbb1aa8c63a65d0966129
amount 400,000
status FINALIZED

nonce 1
id 0xa4aeab1d0e3790b108f92dc430f9150ccf35cb0d1112abeccbe69ce18ea1f4ee
amount 350,000
status FINALIZED

nonce 2
id 0x3ff9156fbfbcba9bf2dcac4750f2be6950c66f5a59e57c6a4814a52dba8bee99
amount 250,000
status FINALIZED
```

Aggregate M8 result:

```text
obligationCount: 3
totalRemaining: 1,000,000
next facility nonce: 3
clearedAmount: 0
settledAmount: 0
```

Live negative paths rejected:

```text
wrong asset class
self-obligation
unknown facility
double finalization
```

Failed issuance preserved the facility nonce.

M8 executable state slice:

```text
NONE -> CREATED -> FINALIZED -> DISPUTED
```

M8 deliberately contains no authority for:

```text
FINALIZED -> ELIGIBLE_FOR_CLEARING
clearedAmount mutation
settledAmount mutation
settlement execution
```

Those belong to later milestones.

## Current Evidence Boundary

Cleara has proven on testnet:

```text
M3: Sepolia claim -> Attestcoin -> VERIFIED claim
M4: VERIFIED fixture -> financeable capacity -> bounded encumbrance
M5: encumbrance -> facility -> provider allocation
M6: externally locked Sepolia capital -> Attestcoin -> ACTIVE commitment
M7: three independently locked commitments -> immutable capitalization seal
M8: live M7 seal -> three canonical FINALIZED drawdown obligations on CC3
```

M8 directly reuses M7 live state, so the M7 -> M8 boundary is one continuous deployed-state transition. Earlier M3-M6 milestones remain separately evidenced deployments; Cleara does not yet claim one uninterrupted M3 -> M8 deployment lifecycle.

## Not Yet Implemented / Not Yet Proven

```text
commitment lifecycle synchronization after source consume/release/expiry
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

## Allowed Public Claim

> Cleara has testnet evidence for Attestcoin-backed claim ingestion, bounded financeability and encumbrance, facility/allocation coordination, externally constrained Sepolia capital commitments recognized on Creditcoin, three-provider capitalization sealed into an immutable commitment composition on CC3, and finalized drawdown obligations issued directly against that live capitalization.

Forbidden current claims include:

```text
production ready
audited
mainnet deployed
legally enforceable receivables
live production lenders or borrowers
source lifecycle synchronization complete
clearing implemented
setoff implemented
residual settlement implemented
bridge reduction measured in production
Wormhole integrated
Credal integrated
Writability live dependency
Base or Arbitrum Attestcoin source support
```

## Current Frontier

```text
M1  VERIFIED_CLEARA
M2  TESTED_TESTNET
M3  TESTED_TESTNET
M4  TESTED_TESTNET
M5  TESTED_TESTNET
M6  TESTED_TESTNET
M7  TESTED_TESTNET
M8  TESTED_TESTNET
M9  NOT_STARTED
```

Rule:

> Cleara must never know more on paper than it can prove in reality.
