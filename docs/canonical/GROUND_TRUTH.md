# Cleara Ground Truth

**Snapshot:** 29 August 2026
**Status:** M1 live verification substrate complete; M2/M3 implemented locally; no Cleara contracts deployed

## Repository

```text
Repository: etvjay/Cleara
Default branch: main
Remote scaffold: live
```

## Verified Cleara Runtime Facts

The following have been verified by Cleara's own GitHub Actions runtime and may be treated as `VERIFIED_CLEARA`.

### Creditcoin CC3 Testnet

```text
RPC: https://rpc.cc3-testnet.creditcoin.network
EVM chainId: 102031
G0: PASS
```

### Attestcoin ChainInfo

Live `getSupportedChains()` on CC3 testnet returned:

```text
chainKey 1 -> EVM chainId 11155111 -> Ethereum Sepolia
chainKey 3 -> EVM chainId 1        -> Ethereum Mainnet
```

Therefore:

```text
chainKey != EVM chainId
```

remains a frozen implementation invariant.

### Proof Builder

Verified endpoint:

```text
https://prover.cc3-testnet.creditcoin.network/
```

G2: PASS using real attested Sepolia transaction:

```text
0x8a848420854482e0978b3d6c1345b6a0dfb0263a9620df90ff1a90db18fcbcf6
```

Source block:

```text
11591355
```

### Block Prover

G3: PASS.

```text
valid proof accepted: true
tampered txBytes proof rejected: true
```

The tampered proof reverted with:

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

## M1 Gate Status

```text
G0 Creditcoin environment   VERIFIED_CLEARA / PASS
G1 ChainInfo                VERIFIED_CLEARA / PASS
G2 Proof Builder            VERIFIED_CLEARA / PASS
G3 Block Prover             VERIFIED_CLEARA / PASS
```

## M2 Registries

Current status:

```text
DomainRegistry      IMPLEMENTED_LOCAL
AssetRegistry       IMPLEMENTED_LOCAL
EvidenceRegistry    IMPLEMENTED_LOCAL
PolicyRegistry      IMPLEMENTED_LOCAL
AuthorityRegistry   IMPLEMENTED_LOCAL
```

Latest validating CI:

```text
GitHub Actions run 33249858831
forge fmt --check PASS
forge build --sizes PASS
forge test -vvv PASS
```

### Evidence Identity Correction

`ADR-0001` supersedes the draft Evidence V1 identifier before any deployment.

Canonical evidence identity is now:

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
a caller-supplied conventional source txHash is not treated as authenticated onchain identity.
```

The record may bind `keccak256(encodedTransaction)` and offchain evidence bundles may retain the conventional source transaction hash for provenance.

No M2 contract is deployed.

## M3 Claim Path

Current status:

```text
ClaimSource          IMPLEMENTED_LOCAL
ClaimRegistry        IMPLEMENTED_LOCAL
ClaimASC             IMPLEMENTED_LOCAL
INativeQueryVerifier IMPLEMENTED_LOCAL boundary
```

Dependencies exercised by CI:

```text
@gluwa/usc-sdk        0.18.0
@gluwa/usc-contracts  0.2.0
Solidity              0.8.30
Foundry               1.7.1
via_ir                 true
```

`ClaimASC` is immutable-bound to one:

```text
source chainKey
source domainId
source ClaimSource contract
```

Its intended acceptance pipeline is implemented as:

```text
correct chainKey
-> derive proof-native txIndex
-> replay check
-> native Block Prover verifyAndEmit
-> decode EVM receipt
-> require receipt.status == 1
-> require exact ClaimCreated signature
-> require exactly one matching ClaimCreated log
-> require exact source contract
-> decode claim payload
-> register Evidence V2
-> register Claim state VERIFIED
```

`ClaimASC` has no financeability authority.

M3 is not `TESTED_TESTNET` yet because the complete live claim round-trip has not been executed.

## Not Yet Verified or Deployed

```text
No Cleara contract is deployed on Sepolia.
No Cleara contract is deployed on CC3 testnet.
No ClaimCreated event has been accepted by live ClaimASC.
No claim has been financially accepted beyond the local ClaimRegistry implementation.
No financeable capacity exists.
No encumbrance exists.
No capital commitment exists.
No facility is capitalized.
No obligation has been cleared.
No settlement has been reconciled.
```

The following remain `NOT_STARTED`:

```text
EncumbranceRegistry
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
```

## Frozen Semantic Boundaries

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

## Next Authorized Milestone

The next promotion gate is the live M3 claim round-trip:

```text
Sepolia ClaimSource deploy
-> ClaimCreated transaction
-> wait for Attestcoin attestation
-> generate proof
-> deploy/configure M2 + ClaimRegistry + ClaimASC on CC3
-> submit proof to ClaimASC
-> observe ClaimRegistry VERIFIED state
-> replay rejection
-> wrong-source rejection
-> failed-receipt rejection fixture/test
```

Only after that may M3 become `TESTED_TESTNET`.

M4 financeability/encumbrance must not begin from an assumption that M3 is already live-tested.

## Public Claim Allowed Now

> Cleara has independently verified the live Creditcoin CC3 / Attestcoin Readability proof path, including tampered-proof rejection. Its initial registries and attested claim-ingestion path are implemented and pass the current local contract CI suite, but Cleara contracts have not yet been deployed and the live claim round-trip remains pending.
