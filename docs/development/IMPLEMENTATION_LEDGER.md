# Cleara Implementation Ledger

| Component | Specification | Implementation | Tests | Live Evidence | Audit | Deployment |
|---|---|---|---|---|---|---|
| M0 Repository scaffold | Frozen | REMOTE_SCAFFOLD_INITIALIZED | Static only | GitHub commits recorded | Not started | GitHub main |
| G0 Creditcoin RPC probe | Frozen | COMPLETE | Live CC3 chainId/block probe PASS | Run 33249132447 | Not started | N/A |
| G1 ChainInfo probe | Frozen | COMPLETE | Live ChainInfo PASS | chainKey 1 Sepolia + chainKey 3 Ethereum Mainnet confirmed | Not started | N/A |
| G2 Proof Builder probe | Frozen | COMPLETE | Real attested Sepolia tx proof generated | tx 0x8a848420854482e0978b3d6c1345b6a0dfb0263a9620df90ff1a90db18fcbcf6 | Not started | N/A |
| G3 Block Prover verification | Frozen | COMPLETE | Valid proof accepted; tampered txBytes rejected | Run 33249132447 / artifact 9713789625 | Not started | N/A |
| M2 Registries | Frozen design + ADR-0001 | TESTED_TESTNET | Evidence V2 + registry suite PASS | M3 deployment/run 33253029696 | Not started | CC3 testnet evidence deployment |
| M3 Claim path | Frozen design | TESTED_TESTNET | ClaimSource/ClaimRegistry/ClaimASC + live positive/negative paths PASS | Run 33253029696 / artifact 9715192463 | Not started | Sepolia + CC3 testnet |
| M3 live round-trip harness | Frozen test gate | COMPLETE | Full cross-chain round-trip PASS | `evidence/runtime/M3_CLAIM_ROUNDTRIP_2026-08-29.md` | Not started | Executed once; workflow restored manual-only |
| Canonical docs/skills mirror | Frozen | PARTIAL_REMOTE_MIRROR | Not applicable | Local canonical package exists | Not started | GitHub main partial |

## M1 Live Evidence

Canonical evidence summary:

`evidence/runtime/ATTESTCOIN_GATES_2026-08-29.md`

GitHub Actions run:

`33249132447`

This promoted only the external verification substrate.

## M2 Testnet Evidence

M2 uses `ADR-0001` proof-native evidence coordinates:

```text
(domainId, chainKey, blockHeight, txIndex, eventIndex)
```

The M2 registries were deployed on CC3 as part of the successful M3 live test:

```text
DomainRegistry:    0x4fFD44f86362a767644efFf63aD34AfC35AeD005
AssetRegistry:     0xdC0D9D3983465b9Cb8c22e3D7e656bc7C206690d
EvidenceRegistry:  0x153e6ED2303CF5De4Dca4522f41939034e3cb2Ec
PolicyRegistry:    0x2cd6ca928979E5E870D862ee6723f9921798c505
AuthorityRegistry: 0xA8eD6954F0E9B7aB9ba4C71cd420F957b0b6E54B
```

These are evidence/test deployments, not production deployments.

## M3 Testnet Evidence

GitHub Actions run:

`33253029696`

Evidence artifact:

```text
Artifact ID: 9715192463
SHA256: 27f3eef3050ed96d659630a90b052e87832fbf5ad0df2cc3dcd9879433c1d488
Repository summary: evidence/runtime/M3_CLAIM_ROUNDTRIP_2026-08-29.md
```

Deployments:

```text
Sepolia ClaimSource: 0xdd013B3423b709bAaC7d2719fCB9d06218Dc2187
CC3 ClaimRegistry:   0x08b3344F24E765e1F61209eEee7d428703F233e9
CC3 ClaimASC:        0x0F6F16983856D5ef7506CFA10e6520B43495c122
```

Positive path:

```text
Sepolia ClaimCreated tx:
0x4b253921043fc71207a4974d0f98dad1225e0ed878c3a342ed1b2772ff8b9869

CC3 ClaimASC acceptance tx:
0x6d08e19ebaf019feb9134e2219168ddd880d592a0f88895cb2b137df47efa1d6

claimId:
0x27c1118eb3ad8a81d585fc0c683f1b0b6727710cb83871e043d2509e171432e7

evidenceId:
0x517a141de1d1a23d0829b573227cf1498b3639b2ec037cfc4f35c450cd33dcaa

ClaimRegistry state:
VERIFIED
```

The same run rejected:

```text
proof replay
wrong chainKey
wrong source contract
receipt.status == 0 source transaction
```

Deliberately failed source transaction:

```text
0x59257e69a97eadbcbe0cc848768610e191f8a3d53cbbd53c6dd3798611de2c2a
```

Build gate immediately before live execution:

```text
forge fmt --check PASS
forge build --sizes PASS
forge test -vvv PASS
12 passed, 0 failed
```

The temporary exact-path push trigger used to start the run was removed after completion. `.github/workflows/m3-live-claim.yml` is again `workflow_dispatch` only.

## Next Milestone

M3 is complete at `TESTED_TESTNET` evidence level.

Next canonical implementation milestone:

```text
M4 financeability + encumbrance
```

M4 must preserve:

```text
VERIFIED CLAIM != FINANCEABLE CLAIM
active encumbrance <= financeable capacity <= face value
terminal claims cannot silently regain capacity
capacity reservation must be atomic onchain
```
