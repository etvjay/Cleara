# Cleara Ground Truth

**Snapshot:** 29 August 2026
**Status:** M1 verification substrate complete; protocol implementation not started

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

## What This Does Not Prove

The M1 proof substrate does not prove any Cleara financial semantics.

The following remain `NOT_STARTED` or `NOT_VERIFIED`:

```text
DomainRegistry
AssetRegistry
EvidenceRegistry
ClaimSource
ClaimASC
ClaimRegistry
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

No Cleara contract is currently deployed.

No claim has been financially accepted by Cleara.

No capital commitment has been recognized by Cleara.

No facility has been capitalized.

No obligation has been cleared.

No settlement has been reconciled.

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

M1 prerequisites are now satisfied.

The next canonical implementation sequence is:

```text
M2 Registries
then
M3 ClaimSource + ClaimASC + ClaimRegistry
```

M3 must additionally prove the Cleara semantic boundary on top of Attestcoin:

```text
proof valid
receipt.status == 1
approved source contract
exact event signature
correct payload
replay rejection
financial state transition
```

## Public Claim Allowed Now

> Cleara has independently verified the live Creditcoin CC3 / Attestcoin Readability path from supported source-chain discovery through proof construction and Block Prover verification, including rejection of a tampered Merkle proof. Cleara protocol contracts and financial semantics are not implemented yet.
