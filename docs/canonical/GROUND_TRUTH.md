# Cleara Ground Truth

**Snapshot:** 29 August 2026  
**Status:** M1 verification substrate VERIFIED; M2/M3/M4 TESTED_TESTNET; M5 not started

## Repository

```text
Repository: etvjay/Cleara
Default branch: main
Remote scaffold: live
```

## Status Vocabulary Used Here

```text
VERIFIED_CLEARA
IMPLEMENTED_LOCAL
TESTED_TESTNET
NOT_STARTED
NOT_VERIFIED
FUTURE
FORBIDDEN_CLAIM
```

No testnet result in this document implies production or mainnet readiness.

---

# M1 — Creditcoin / Attestcoin Verification Substrate

The following were verified by Cleara's own GitHub Actions runtime and are `VERIFIED_CLEARA`.

## Creditcoin CC3 Testnet

```text
RPC: https://rpc.cc3-testnet.creditcoin.network
EVM chainId: 102031
G0: PASS
```

## Attestcoin ChainInfo

Live `getSupportedChains()` on CC3 testnet returned:

```text
chainKey 1 -> EVM chainId 11155111 -> Ethereum Sepolia
chainKey 3 -> EVM chainId 1        -> Ethereum Mainnet
```

Frozen invariant:

```text
chainKey != EVM chainId
```

## Proof Builder

Verified endpoint:

```text
https://prover.cc3-testnet.creditcoin.network/
```

G2 passed using real attested Sepolia transaction:

```text
0x8a848420854482e0978b3d6c1345b6a0dfb0263a9620df90ff1a90db18fcbcf6
```

Source block:

```text
11591355
```

## Block Prover

G3 passed:

```text
valid proof accepted: true
tampered txBytes proof rejected: true
```

Tampered proof failure:

```text
Merkle proof validation failed
```

Evidence:

```text
GitHub Actions run: 33249132447
Artifact ID: 9713789625
Artifact SHA256: 64394abd8c2382f10c7499d1cb86122d8bd3502a241433307b8a3d1de360cf10
Repository evidence: evidence/runtime/ATTESTCOIN_GATES_2026-08-29.md
```

M1 status:

```text
G0 Creditcoin environment   VERIFIED_CLEARA / PASS
G1 ChainInfo                VERIFIED_CLEARA / PASS
G2 Proof Builder            VERIFIED_CLEARA / PASS
G3 Block Prover             VERIFIED_CLEARA / PASS
```

---

# M2 — Registries

Current status:

```text
DomainRegistry      TESTED_TESTNET
AssetRegistry       TESTED_TESTNET
EvidenceRegistry    TESTED_TESTNET
PolicyRegistry      TESTED_TESTNET
AuthorityRegistry   TESTED_TESTNET
```

They were deployed on CC3 testnet as part of the successful M3 evidence run.

Evidence deployment addresses:

```text
DomainRegistry:    0x4fFD44f86362a767644efFf63aD34AfC35AeD005
AssetRegistry:     0xdC0D9D3983465b9Cb8c22e3D7e656bc7C206690d
EvidenceRegistry:  0x153e6ED2303CF5De4Dca4522f41939034e3cb2Ec
PolicyRegistry:    0x2cd6ca928979E5E870D862ee6723f9921798c505
AuthorityRegistry: 0xA8eD6954F0E9B7aB9ba4C71cd420F957b0b6E54B
```

These are test/evidence deployments. They are not production contracts.

## Evidence Identity — ADR-0001

`ADR-0001` supersedes the draft Evidence V1 identifier.

Canonical Evidence V2 identity is:

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

Reason:

```text
txIndex is derived from the same Merkle proof validated by the native verifier.
a caller-supplied conventional source txHash is not authenticated onchain identity.
```

The evidence record may bind `keccak256(encodedTransaction)`.
Offchain bundles may retain the conventional source transaction hash for provenance and navigation.

---

# M3 — Attested Claim Ingestion

Current status:

```text
ClaimSource          TESTED_TESTNET
ClaimRegistry        TESTED_TESTNET
ClaimASC             TESTED_TESTNET
INativeQueryVerifier TESTED_TESTNET boundary
```

Dependencies exercised:

```text
@gluwa/usc-sdk        0.18.0
@gluwa/usc-contracts  0.2.0
Solidity              0.8.30
Foundry               1.7.1
via_ir                 true
```

`via_ir = true` is currently required because the Attestcoin decoder path triggers Solidity stack-depth limitations in non-IR code generation. Cleara's own acceptance function was first refactored to reduce live stack pressure before IR was enabled.

## ClaimASC Authority Boundary

`ClaimASC` is immutable-bound to one:

```text
source chainKey
source domainId
source ClaimSource contract
```

It also consults live domain and asset registries.

Therefore a source domain disabled after deployment cannot continue accepting claims, and an inactive/unregistered asset class cannot be accepted.

ClaimASC has no financeability authority.

Implemented acceptance path:

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

---

# M3 Live Testnet Evidence

GitHub Actions run:

```text
33253029696
```

Artifact:

```text
Artifact ID: 9715192463
Artifact SHA256: 27f3eef3050ed96d659630a90b052e87832fbf5ad0df2cc3dcd9879433c1d488
Repository evidence: evidence/runtime/M3_CLAIM_ROUNDTRIP_2026-08-29.md
```

## Testnet Signer Addresses

```text
Sepolia: 0x04A9351c40748348f4a4e012d21b2Bd775a5d484
CC3:     0x5ac98dc6f8408564645f36195aC0F9c5B1c0C0C8
```

Private keys were consumed only through GitHub `testnet` environment secrets and were redacted from runner logs.

## Deployed M3 Contracts

Sepolia:

```text
ClaimSource: 0xdd013B3423b709bAaC7d2719fCB9d06218Dc2187
```

CC3:

```text
ClaimRegistry: 0x08b3344F24E765e1F61209eEee7d428703F233e9
ClaimASC:      0x0F6F16983856D5ef7506CFA10e6520B43495c122
```

Additional negative-test gateway:

```text
WrongSourceASC: 0xcFC354FDD8938943BBF5E6908937C9175A00cf4C
```

## Domain / Asset

```text
source chainKey: 1
sourceDomainId: 0x1654b943073ae832a6819e7e0b3654c6f3df918b68411b60b0fd4884b18a4851
assetClassId:   0xa2518a1efcc7102c995133774e96f25cd34715d11795719720b421f3b4f45221
```

## Positive Path

Real Sepolia `ClaimCreated` transaction:

```text
0x4b253921043fc71207a4974d0f98dad1225e0ed878c3a342ed1b2772ff8b9869
```

Source block:

```text
11591891
```

After Attestcoin attested the source history, the proof was constructed and submitted to live CC3 `ClaimASC`.

Successful CC3 acceptance transaction:

```text
0x6d08e19ebaf019feb9134e2219168ddd880d592a0f88895cb2b137df47efa1d6
```

Result:

```text
claimId:
0x27c1118eb3ad8a81d585fc0c683f1b0b6727710cb83871e043d2509e171432e7

evidenceId:
0x517a141de1d1a23d0829b573227cf1498b3639b2ec037cfc4f35c450cd33dcaa

ClaimRegistry state:
VERIFIED
```

This is direct testnet evidence of:

```text
Sepolia ClaimSource
-> real ClaimCreated event
-> Attestcoin Readability proof
-> CC3 ClaimASC semantic validation
-> EvidenceRegistry V2
-> ClaimRegistry VERIFIED
```

## Negative Paths Verified Live

The same run rejected:

```text
replay of already-processed proof coordinates
wrong source chainKey
valid proof submitted to ClaimASC bound to a different source contract
source transaction with receipt.status == 0
```

Deliberately failed Sepolia transaction:

```text
0x59257e69a97eadbcbe0cc848768610e191f8a3d53cbbd53c6dd3798611de2c2a
```

Source block:

```text
11591939
```

Attestcoin proved the transaction history, but `ClaimASC` rejected its business acceptance because the receipt failed.

This preserves:

```text
PROVEN != VALID FOR THIS FACILITY / PROTOCOL STATE
INCLUSION != TRANSACTION SUCCESS
```

The current ethers surface reported these custom-error reverts as `unknown custom error`. Improving revert decoding is a developer-experience task, not a correctness blocker.

## Build Gate Before Live Execution

```text
forge fmt --check PASS
forge build --sizes PASS
forge test -vvv PASS
12 tests passed
0 failed
```

`ClaimASC` runtime size:

```text
6,896 bytes
```

## Attestcoin Timing Observed

The live run directly observed sparse attestation progression.

For successful source block `11591891`, the Proof Builder reported latest attested/cache heights advancing through:

```text
11591850
11591860
11591870
11591880
11591890
```

before the proof became available.

A second wait occurred for failed source block `11591939`.

Therefore Cleara must continue treating Attestcoin source verification as asynchronous.

Forbidden claim:

```text
"cross-chain verification completes in one Creditcoin block"
```

A Creditcoin verification transaction may execute within its own block once proof material is available; that is not total source-to-Creditcoin latency.

---

# M4 — Financeability and Encumbrance

Current status:

```text
Claim financeable-capacity controls TESTED_TESTNET
EncumbranceRegistry              TESTED_TESTNET
```

M4 preserves the distinction:

```text
VERIFIED != FINANCEABLE
```

A newly verified claim begins with:

```text
financeableCapacity = 0
activeEncumbrance   = 0
```

An explicit financeability decision, bound to `policyId` and `decisionHash`, may move a claim from `VERIFIED` to `ACTIVE` and set bounded capacity.

The implemented accounting invariant is:

```text
activeEncumbrance <= financeableCapacity <= faceValue
availableCapacity = financeableCapacity - activeEncumbrance
```

Only `EncumbranceRegistry` is intended to receive `ENCUMBRANCE_ROLE` and mutate the aggregate active-encumbrance field.

Encumbrance identity is:

```text
keccak256("CLEARA_ENCUMBRANCE_V1", claimId, facilityId, encumbranceNonce)
```

Implemented M4 transitions:

```text
PROPOSED -> ACTIVE
ACTIVE -> RELEASED
ACTIVE -> CANCELLED
ACTIVE -> EXPIRED
```

`CONSUMED` remains represented in the canonical enum but is deliberately not executable yet. Its semantics require the Facility/Allocation authority introduced in M5.

## M4 Local Property Evidence

GitHub Actions run:

```text
33254476294
```

Passed:

```text
forge fmt --check
forge build --sizes
forge test -vvv
```

The later live workflow reran the complete suite with:

```text
22 tests passed
0 failed
0 skipped
```

M4 fuzz properties each passed 1,000 generated cases:

```text
capacity never exceeds face value
accepted reservations conserve capacity
over-reservations always revert without mutating accounting
```

## M4 CC3 Live Evidence

GitHub Actions run:

```text
33254529904
```

Artifact:

```text
Artifact ID: 9715412301
Artifact SHA256: cb0d42256da26ba6f769b9d377dfebf830b0d44a5efafa8b8d36b345537fc940
Repository evidence: evidence/runtime/M4_FINANCEABILITY_2026-08-29.md
```

Evidence deployments on CC3:

```text
ClaimRegistry:       0x3b12A365e9beA21035Ab811DA42F04dAfF89e1DC
EncumbranceRegistry: 0x6B1C82122165ec351407ABa272d19daEDE9f7a44
```

Live accounting vector:

```text
faceValue             = 100,000,000
financeableCapacity   =  80,000,000
first reservation     =  50,000,000
available after A     =  30,000,000
second request        =  40,000,000 -> REJECTED
release A             =  50,000,000
final active          =           0
final available       =  80,000,000
```

The same live run rejected:

```text
over-reservation
reducing capacity below active encumbrance
double release
```

and verified that rejected operations did not mutate the financial accounting state.

Important evidence boundary:

```text
The M4 CC3 run registered its VERIFIED claim fixture directly through ClaimRegistry.
It tests M4 accounting, not a second Attestcoin ingestion proof.
M3 separately proves the Sepolia -> Attestcoin -> ClaimASC -> VERIFIED boundary.
```

The M4 ClaimRegistry extends the previously live-tested M3 ClaimRegistry with additive financeability/encumbrance state while preserving the existing `registerVerifiedClaim` interface. Current CI exercises the combined codebase. A fresh all-in-one Sepolia -> Attestcoin -> current ClaimRegistry -> financeability -> encumbrance test has not yet been run and must not be implied by the separate M3 and M4 evidence bundles.

---

# Workflow Security State

The M3 and M4 live workflows are again:

```text
workflow_dispatch only
permissions: contents read
environment: testnet
```

Temporary exact-path push triggers were used solely because the connected GitHub execution interface could not dispatch manual workflows. Each was removed immediately after its successful run, and its trigger file was deleted.

The `testnet` GitHub environment currently contains throwaway testnet deployer secrets. Environment protection hardening remains an operational follow-up; these credentials are not production credentials.

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

---

# Not Yet Implemented / Verified

The following remain `NOT_STARTED`:

```text
FacilityManager
AllocationManager
CapitalCommitmentVault
CommitmentASC
CommitmentRegistry
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

Financeable capacity and active encumbrance now exist as testnet-tested Cleara state primitives.

No capital commitment has been recognized.

No facility has been capitalized.

No obligation has been formed or cleared.

No residual settlement has been executed or reconciled.

No Cleara mainnet deployment exists.

No production deployment exists.

---

# Next Authorized Milestone

M4 has passed its local property and CC3 live accounting gates.

The next canonical milestone is:

```text
M5 Facility + Allocation
```

M5 must introduce the authority that binds:

```text
verified/active claims
encumbrances
provider allocations
facility lifecycle
```

without collapsing:

```text
ALLOCATION != CAPITAL COMMITMENT
```

M5 is also the earliest milestone in which `EncumbranceStatus.CONSUMED` may be defined, because consumption must correspond to an explicit facility-owned position rather than simply freeing capacity.

---

# Public Claim Allowed Now

> Cleara has live-tested its first cross-chain claim-ingestion path and its first financing-capacity control on Creditcoin CC3. A real Sepolia ClaimCreated transaction was proven through Attestcoin and registered as a VERIFIED claim on Creditcoin; separately, Cleara's current financeability and encumbrance contracts enforced bounded claim capacity, rejected over-encumbrance and unsafe capacity reduction, and restored released capacity exactly once on CC3. These are testnet evidence paths, not a claim of production readiness or a single all-in-one facility flow. Capital commitments, facilities, obligations, clearing, and settlement are not yet implemented.
