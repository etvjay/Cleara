# Cleara Ground Truth

**Snapshot:** 3 September 2026
**Operational status:** M1 `VERIFIED_CLEARA`; M2-M11 and M11-Lifecycle `TESTED_TESTNET`; indexed read-model projection core `IMPLEMENTED_LOCAL`; current-head M11 and M11-Lifecycle live revalidation passed in runs `33614782209` and `33699324988`.

This document is the highest operational statement of what Cleara can currently prove. Historical M11 evidence is tied to its exercised commit and does not automatically validate later hardening. No testnet result implies production safety, mainnet readiness, legal enforceability, economic finality, or audit completion.

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
CLEARING AUTHORIZATION != CLEARING EXECUTION
CLEARING != SETTLEMENT
ECONOMIC RESIDUAL != SETTLEMENT INSTRUCTION
ROUTED != SETTLED
SETTLEMENT INITIATED != SETTLED
DATABASE != CANONICAL FINANCIAL STATE
```

Current accounting invariants:

```text
activeEncumbrance <= financeableCapacity <= faceValue
committedAmount <= allocatedAmount <= encumberedAmount <= targetAmount
activeCommittedAmount = committedAmount - consumedAmount - expiredAmount
obligation.clearedAmount + obligation.settledAmount <= obligation.originalAmount
```

M9 can increase `clearedAmount` only through the bound ClearingEngine after explicit clearing authorization. M10 derives a residual and records a route instruction. M11 adds source settlement execution and attested reconciliation; its current-head payer-validation hardening passed live revalidation in run `33614782209`.

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
M9 ClearingEngine / ClearingEpoch                  TESTED_TESTNET
M10 ResidualLedger / SettlementRouter              TESTED_TESTNET
M11 SettlementAdapter / SettlementASC              TESTED_TESTNET
M11-Lifecycle CommitmentLifecycleASC               TESTED_TESTNET
Indexed read-model projection core                IMPLEMENTED_LOCAL
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

Live negative paths rejected wrong asset class, self-obligation, unknown facility, and double finalization. Failed issuance preserved the facility nonce.

## M9 — Bilateral Clearing

Status: `TESTED_TESTNET`

Evidence:

```text
Run: 33280768286
Head exercised: f7205170d7d709921f8572dae7a9c01ec693ec13
Artifact: 9722957475
SHA256: 3aede24e78500b998a9438d62be969eda200adf7040d792449902a0041f6be12
Evidence: evidence/runtime/M9_BILATERAL_CLEARING_2026-08-29.md
```

Build/property gate:

```text
59 tests passed
0 failed
0 skipped
3 M9 fuzz properties x 1000 cases PASS
```

M9 reused the actual M7 capitalization and deployed a new M9-capable obligation ledger rather than pretending the immutable M8 deployment was upgradeable.

Live deployments:

```text
ObligationLedger V2:    0xCe29e08e9668aa0c3CE3A2C9E29774a2233abB86
ClearingPolicyRegistry: 0xE376fe50c831DB797d9168289A01Bce02Cc4c997
ClearingEngine:         0xe87835B72e49EEBe4778c8769A0546a216A71f69
```

Live vector:

```text
Provider A -> Sponsor drawdown  400,000
Sponsor -> Provider A fee        60,000
                              ---------
grossBefore                     460,000
bilateral clearing amount        60,000
grossAfter                      340,000
movementReduced                 120,000
```

Finalized clearing epoch:

```text
epochId: 0xb16d67f3a82e4e79409c344f012565125e77fbd2293be85404a7de10abf1f8c2
inputRoot: 0xa75b8beb36648c8f1103deee1f123c7ab4114dbf54af9981ca631ba851aa1e62
status: FINALIZED
```

Live negative paths rejected reciprocity without explicit authorization, MULTILATERAL policy configuration, and epoch reseal.

M9 establishes:

```text
RECIPROCITY != SETOFF AUTHORITY
CLEARING AUTHORIZATION != CLEARING EXECUTION
CLEARING != SETTLEMENT
```

## M10 — Residual Ledger / Settlement Routing

Status: `TESTED_TESTNET`

Evidence:

```text
Run: 33311029527
Head exercised: 9388ec6ef5c4511f560f35b8d3c06d21f3f95985
Artifact: 9731999552
SHA256: 0071c3f003a6f4c1f3839cc4849ce450365f5385cf186ddeb44ba002328affc0
Evidence: evidence/runtime/M10_RESIDUAL_ROUTING_2026-08-30.md
```

Build/property gate:

```text
72 tests passed
0 failed
0 skipped
3 M10 fuzz properties x 1000 cases PASS
```

M10 reused the actual finalized M9 clearing epoch and derived the economic remainder from onchain obligation accounting. No arbitrary residual amount was supplied by the operator.

Live deployments:

```text
ResidualLedger:    0xeb8f98D41ad6f626d8808F70c7b0C455Fd248384
SettlementRouter:  0x425E8b8c38025dFD886446947209D21407dC7319
```

Derived residual:

```text
residualId: 0xb7b1905b8e4b08c9db578059492c47d6464e61b5b20c14c0c4b6c9721ccbeae6
sourceObligationId: 0x330647cb907ce83563e27d406c3c3789b2756705ff4cbb1aa8c63a65d0966129
debtor:   0x8766760e375bD43f600D23C40aDCeeDD62a60e2b
creditor: 0x5ac98dc6f8408564645f36195aC0F9c5B1c0C0C8
amount:   340,000
status:   ROUTED
```

Route instruction:

```text
settlementId: 0x82b7b4c56e20cbb8c3ac0013282e26a4f9288dedfd9f4f8ee0091687b358f40b
route tx: 0x9cc4dea116a9700e2f9a63e2ab4163b9f2480475292830f9406a00b0c738a5d0
settlementNonce: 0
status: ROUTED
```

Settlement accounting remained unchanged:

```text
drawdown settledAmount before: 0
drawdown settledAmount after:  0
fee settledAmount before:      0
fee settledAmount after:       0
```

Live negative paths rejected duplicate residualization of the same epoch and duplicate routing of the same residual.

M10 establishes:

```text
ECONOMIC RESIDUAL != SETTLEMENT INSTRUCTION
ROUTED != SETTLED
```

M10 limitation:

```text
The route identifiers are test-only nonzero identifiers and are not yet authenticated against DomainRegistry / AssetRegistry.
No settlement adapter was called.
No value moved.
No settlement proof was ingested.
No settledAmount changed.
```

## M11 — Attested Settlement Reconciliation

Implementation status: `TESTED_TESTNET`; current-head live execution: `PASS`.

Current-head evidence:

```text
Workflow: M11 Live Attested Settlement
Run: 33614782209
Head: c5f8eecd39602aeb6b4a0d91c4071f520d583beb
Job: settlement / 100197992292
Artifact: 9841386218
Artifact SHA256: 873c7238dc6441b4a486677c884b6a55f0a3dfb095126821dcdb8faee4da94ff
Evidence: evidence/runtime/M11_ATTESTED_SETTLEMENT_2026-09-02.md
```

The current-head run passed the build/property gate, live Sepolia settlement, independent ERC20 payer validation, Attestcoin proof acceptance and consumption, exact full-residual reconciliation, replay rejection, and wrong-chain rejection.

Historical evidence retained:

```text
Workflow: M11 Live Attested Settlement
Run: 33349834574
Head exercised: 8e6788e7e82f80f3da2a8212baec79be6b66ca90
Artifact: 9744064841
Artifact SHA256: 4402faf1ff2dc265643339e7bb5caffda0c91df2bd80fbaec1d8baf32fa85ab0
Evidence: evidence/runtime/M11_ATTESTED_SETTLEMENT_2026-08-31.md
```

The historical run exercised:

```text
Sepolia SettlementAdapter ERC20 execution
-> Attestcoin proof for the successful source transaction
-> SettlementASC acceptance on Creditcoin CC3
-> one-time evidence consumption
-> SettlementReconciler
-> residual SETTLED
-> source obligation SETTLED
```

Observed result:

```text
source settlement amount: 340,000
source debtor balance: 340,000 -> 0
source creditor balance: 0 -> 340,000
evidenceConsumed: true
drawdown settledAmount: 340,000
drawdown remaining: 0
residual status: SETTLED
reconciled: true
replay: rejected
wrong chain: rejected
```

The historical evidence remains tied to its exercised commit. The current-head evidence supersedes its pending revalidation caveat for M11, while retaining the same testnet/mock-token and non-production boundary.

## Current Evidence Boundary

Cleara has proven on testnet:

```text
M3: Sepolia claim -> Attestcoin -> VERIFIED claim
M4: VERIFIED fixture -> financeable capacity -> bounded encumbrance
M5: encumbrance -> facility -> provider allocation
M6: externally locked Sepolia capital -> Attestcoin -> ACTIVE commitment
M7: three independently locked commitments -> immutable capitalization seal
M8: live M7 seal -> canonical FINALIZED drawdown obligations on CC3
M9: explicit bilateral setoff authorization -> immutable clearing epoch -> deterministic cleared accounting
M10: finalized M9 epoch -> canonical 340,000 residual -> one route instruction, with settlement accounting unchanged
M11 (current head): source mock-token settlement -> Attestcoin -> SettlementASC -> reconciliation -> SETTLED
M11-Lifecycle (current head): CapitalConsumed / CapitalExpired -> Attestcoin -> CommitmentLifecycleASC -> terminal commitment/allocation state
Indexed read-model projection core (local): observed source/Creditcoin events -> deterministic read-only projection -> JSON checkpoint
```

M7 -> M8, M7 -> M9, and M9 -> M10 directly reuse live deployed state. Earlier M3-M6 milestones remain separately evidenced deployments; Cleara does not yet claim one uninterrupted M3 -> M10 deployment lifecycle.

## M11-Lifecycle — Commitment Lifecycle Attestation

Status: `TESTED_TESTNET`; current-head live execution: `PASS`.

Evidence:

```text
Workflow: M11 Lifecycle Live Attestation
Run: 33699324988
Head: 57cc061972ddaa1b308b13e722a4ad0f9b62bf43
Job: lifecycle / 100474985355
Artifact: 9873864767
Artifact name: m11-lifecycle-33699324988
Evidence status: PASS
```

The current-head run passed the build/property gate, fresh Sepolia and CC3
fixture deployment, independent source-receipt validation, Attestcoin proof
acceptance and consumption for both lifecycle events, exact terminal
commitment/allocation transitions, gross-versus-terminal accounting
reconciliation, replay rejection, and wrong-chain rejection.

Observed lifecycle accounting:

```text
gross committed: 200,000
consumed:        100,000
expired:         100,000
active:                0
source vault:          0
gross = terminal + active: true
```

This is testnet evidence using the documented mock-token fixture. It does not
prove production capital, Attestcoin writability, or an indexed read model.

## Not Yet Implemented / Not Yet Proven

```text
indexed read model (production integration)
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

> Cleara has testnet evidence for Attestcoin-backed claim ingestion, bounded financeability and encumbrance, facility/allocation coordination, externally constrained Sepolia capital commitments recognized on Creditcoin, three-provider capitalization sealed into an immutable commitment composition on CC3, finalized financial obligations, explicitly authorized bilateral clearing that reduced a 460,000 gross obligation pair to a 340,000 residual, canonical residual routing, a current-head M11 mock-token settlement roundtrip that was independently payer-validated, Attestcoin-verified, and reconciled on CC3 to `SETTLED`, and current-head M11-Lifecycle consume/expire synchronization with reconciled terminal accounting. The indexed read-model projection core is local scaffolding and is not testnet evidence.

Forbidden current claims include:

```text
production ready
audited
mainnet deployed
legally enforceable receivables or setoff
live production lenders or borrowers
indexed read model complete
production settlement operation
settlement finality proven
settlement route identifiers registry-authenticated
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
M9  TESTED_TESTNET
M10 TESTED_TESTNET
M11 TESTED_TESTNET
M11-Lifecycle TESTED_TESTNET
Indexed read-model projection core IMPLEMENTED_LOCAL
```

Rule:

> Cleara must never know more on paper than it can prove in reality.
