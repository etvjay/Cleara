# Cleara Implementation Ledger

| Component | Specification | Implementation | Tests | Live Evidence | Audit | Deployment |
|---|---|---|---|---|---|---|
| M0 Repository scaffold | Frozen | REMOTE_SCAFFOLD_INITIALIZED | Static only | GitHub commits recorded | Not started | GitHub main |
| G0 Creditcoin RPC probe | Frozen | COMPLETE | Live CC3 chainId/block probe PASS | Run 33249132447 | Not started | N/A |
| G1 ChainInfo probe | Frozen | COMPLETE | Live ChainInfo PASS | chainKey 1 Sepolia + chainKey 3 Ethereum Mainnet confirmed | Not started | N/A |
| G2 Proof Builder probe | Frozen | COMPLETE | Real attested Sepolia tx proof generated | tx 0x8a848420854482e0978b3d6c1345b6a0dfb0263a9620df90ff1a90db18fcbcf6 | Not started | N/A |
| G3 Block Prover verification | Frozen | COMPLETE | Valid proof accepted; tampered txBytes rejected | Run 33249132447 / artifact 9713789625 | Not started | N/A |
| M2 Registries | Frozen design + ADR-0001 | IMPLEMENTED_LOCAL | Evidence V2 + registry suite PASS | CI run 33250046119 | Not started | Not deployed |
| M3 Claim path | Frozen design | IMPLEMENTED_LOCAL | ClaimSource/ClaimRegistry/ClaimASC policy suite PASS | CI run 33250046119; live claim round-trip pending | Not started | Not deployed |
| M3 live round-trip harness | Frozen test gate | READY_BLOCKED_CREDENTIALS | Build + workflow scaffolded | Requires funded Sepolia + CC3 signers | Not started | Not executed |
| Canonical docs/skills mirror | Frozen | PARTIAL_REMOTE_MIRROR | Not applicable | Local canonical package exists | Not started | GitHub main partial |

## M1 Live Evidence

Canonical evidence summary:

`evidence/runtime/ATTESTCOIN_GATES_2026-08-29.md`

GitHub Actions run:

`33249132447`

This promotes only the external verification substrate. It does not promote any Cleara financial contract or business-semantic verification path.

## M2 Local Evidence

M2 was revised before deployment by `ADR-0001` to use proof-native evidence coordinates:

```text
(domainId, chainKey, blockHeight, txIndex, eventIndex)
```

rather than trusting a caller-supplied source transaction hash as canonical onchain evidence identity.

Latest validating GitHub Actions run:

`33250046119`

Passed:

```text
forge fmt --check
forge build --sizes
forge test -vvv
```

M2 remains `IMPLEMENTED_LOCAL`. No registry contract is deployed on CC3 testnet yet.

## M3 Local Evidence

Implemented:

```text
ClaimSource
ClaimRegistry
ClaimASC
INativeQueryVerifier boundary
@gluwa/usc-contracts EvmV1Decoder integration
```

`ClaimASC` is bound to one source chainKey/domain/source contract and additionally consults live registries so that a domain disabled after deployment cannot continue accepting claims and an unregistered/inactive asset class cannot be accepted.

The acceptance path enforces:

```text
live domain active/readable/claim/evidence policy
registered active asset class
native proof verification
receipt.status == 1
exact ClaimCreated event signature
exact source contract
exact topic shape
single matching ClaimCreated log
proof-native replay identity
```

The current build requires `via_ir = true` because the current Attestcoin decoder path triggers Solidity stack-depth limits in non-IR code generation. Cleara's own acceptance function was first refactored to reduce its live stack before enabling IR.

Latest validating GitHub Actions run:

`33250046119`

The suite includes negative tests for:

```text
wrong source chainKey
domain disabled after ClaimASC deployment
native verifier failure
```

M3 remains `IMPLEMENTED_LOCAL`, not `TESTED_TESTNET`.

## M3 Live Harness

Created:

```text
scripts/live/m3-claim-roundtrip.ts
.github/workflows/m3-live-claim.yml
```

The harness is designed to execute:

```text
Sepolia ClaimSource deployment
CC3 registry + ClaimRegistry + ClaimASC deployment
live domain + asset registration
successful ClaimCreated transaction
Attestcoin proof generation
ClaimASC acceptance
ClaimRegistry VERIFIED assertion
replay rejection
wrong-chain rejection
wrong-source rejection
deliberately failed Sepolia transaction proof
receipt.status == 0 rejection
```

It is deliberately manual and secret-gated.

Required GitHub testnet secrets:

```text
SEPOLIA_DEPLOYER_PRIVATE_KEY
CC3_DEPLOYER_PRIVATE_KEY
```

Both corresponding wallets must be funded with Sepolia ETH / CC3 test CTC respectively.

Until those credentials exist and the workflow passes, no contract may be promoted to `TESTED_TESTNET` or `DEPLOYED_TESTNET`.
