# Cleara M3 Live Claim Round Trip Evidence

**Date:** 29 August 2026  
**Status:** PASS  
**GitHub Actions run:** `33253029696`  
**Artifact ID:** `9715192463`  
**Artifact SHA256:** `27f3eef3050ed96d659630a90b052e87832fbf5ad0df2cc3dcd9879433c1d488`

## Networks

```text
Sepolia chainId: 11155111
CC3 chainId:     102031
Attestcoin source chainKey: 1
Proof Builder: https://prover.cc3-testnet.creditcoin.network/
```

Testnet signers used:

```text
Sepolia: 0x04A9351c40748348f4a4e012d21b2Bd775a5d484
CC3:     0x5ac98dc6f8408564645f36195aC0F9c5B1c0C0C8
```

Private keys were supplied only through GitHub `testnet` environment secrets and were redacted in runner output.

## Deployments

### Sepolia

```text
ClaimSource: 0xdd013B3423b709bAaC7d2719fCB9d06218Dc2187
```

### CC3 Testnet

```text
DomainRegistry:    0x4fFD44f86362a767644efFf63aD34AfC35AeD005
AssetRegistry:     0xdC0D9D3983465b9Cb8c22e3D7e656bc7C206690d
EvidenceRegistry:  0x153e6ED2303CF5De4Dca4522f41939034e3cb2Ec
PolicyRegistry:    0x2cd6ca928979E5E870D862ee6723f9921798c505
AuthorityRegistry: 0xA8eD6954F0E9B7aB9ba4C71cd420F957b0b6E54B
ClaimRegistry:     0x08b3344F24E765e1F61209eEee7d428703F233e9
ClaimASC:          0x0F6F16983856D5ef7506CFA10e6520B43495c122
WrongSourceASC:    0xcFC354FDD8938943BBF5E6908937C9175A00cf4C
```

## Configuration

```text
sourceDomainId: 0x1654b943073ae832a6819e7e0b3654c6f3df918b68411b60b0fd4884b18a4851
assetClassId:   0xa2518a1efcc7102c995133774e96f25cd34715d11795719720b421f3b4f45221
```

## Positive Path

A real `ClaimCreated` transaction was emitted by Cleara's Sepolia `ClaimSource`:

```text
source tx:    0x4b253921043fc71207a4974d0f98dad1225e0ed878c3a342ed1b2772ff8b9869
source block: 11591891
```

The workflow waited until Attestcoin had attested the source height, constructed the proof using the live hosted Proof Builder, and submitted it to the deployed CC3 `ClaimASC`.

The CC3 acceptance transaction succeeded:

```text
CC3 tx:     0x6d08e19ebaf019feb9134e2219168ddd880d592a0f88895cb2b137df47efa1d6
claimId:    0x27c1118eb3ad8a81d585fc0c683f1b0b6727710cb83871e043d2509e171432e7
evidenceId: 0x517a141de1d1a23d0829b573227cf1498b3639b2ec037cfc4f35c450cd33dcaa
claimState: 2 (VERIFIED)
```

This demonstrates the implemented M3 path:

```text
Sepolia ClaimSource
-> ClaimCreated
-> Attestcoin Readability proof
-> CC3 ClaimASC
-> EvidenceRegistry V2
-> ClaimRegistry VERIFIED
```

## Negative Paths

The same live run verified that the gateway rejects:

```text
replay of already-consumed proof coordinates
wrong source chainKey
valid proof presented to a ClaimASC bound to a different source contract
source transaction whose receipt.status == 0
```

Deliberately failed source transaction:

```text
source tx:    0x59257e69a97eadbcbe0cc848768610e191f8a3d53cbbd53c6dd3798611de2c2a
source block: 11591939
receipt:      failed
ClaimASC:     rejected
```

The runner reported reverts for all four negative cases. The current ethers error surface rendered the custom-error names as `unknown custom error`; the transaction behavior itself was correctly fail-closed. Improving custom-error decoding is a developer-experience follow-up, not a correctness blocker.

## Attestation Observation

The successful claim source block was `11591891`. During the wait, Attestcoin's latest cached attested height advanced incrementally from `11591850` through `11591890` before the proof became available.

The failed-transaction block was `11591939`; the second proof wait similarly observed sparse Attestcoin progression before completion.

This confirms that Cleara must model Attestcoin as asynchronous source-finality/attestation infrastructure and must not advertise source-to-Creditcoin latency as a single Creditcoin block.

## Build/Test Gate

Immediately before live execution:

```text
forge fmt --check PASS
forge build --sizes PASS
forge test -vvv PASS
12 tests passed, 0 failed
```

`ClaimASC` runtime size in this build:

```text
6,896 bytes
```

## Security Notes

The live workflow had:

```text
permissions: contents: read
environment: testnet
```

A temporary exact-path push trigger was used because the connected execution interface could not invoke GitHub's workflow-dispatch endpoint. After successful execution, the workflow was restored to `workflow_dispatch` only and the trigger file was deleted.

## Ground Truth Promotion

This evidence is sufficient to promote:

```text
M3 ClaimSource + ClaimASC + ClaimRegistry -> TESTED_TESTNET
M2 deployed registry instances -> DEPLOYED_TESTNET for this M3 evidence deployment
```

It is NOT evidence of:

```text
mainnet readiness
production deployment
financeable capacity
encumbrance
capital commitment
facility capitalization
obligation formation
clearing
settlement
```
