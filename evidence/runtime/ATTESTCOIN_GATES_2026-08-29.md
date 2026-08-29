# Cleara Attestcoin G0-G3 Live Evidence

**Date:** 29 August 2026
**Environment:** Creditcoin CC3 Testnet + Ethereum Sepolia
**GitHub Actions run:** `33249132447`
**Workflow commit:** `70020c13f01404cd892cec493335d066316e663f`
**Artifact:** `attestcoin-gates-33249132447` (`9713789625`)
**Artifact SHA256:** `64394abd8c2382f10c7499d1cb86122d8bd3502a241433307b8a3d1de360cf10`

## Verdict

```text
G0 Creditcoin environment       PASS
G1 Attestcoin ChainInfo         PASS
G2 Proof Builder                PASS
G3 Block Prover                 PASS
G3 tampered proof rejection     PASS
```

## G0 — Creditcoin

```text
RPC: https://rpc.cc3-testnet.creditcoin.network
chainId: 102031
observed block: 5394185
```

## G1 — Live Attestcoin ChainInfo

Live `getSupportedChains()` returned:

```text
chainKey 3 -> chainId 1        Ethereum Mainnet
chainKey 1 -> chainId 11155111 Ethereum Sepolia
```

For Sepolia `chainKey 1`, the latest attested state observed by the run was:

```text
height: 11591360
hash: 0xec316fe3c932a8ad999f47a2c020ce27bd1a98a62e3adf0ba0db0b9bf1937df6
isAttestation: true
exists: true
```

## G2 — Proof Builder

Proof Builder used:

```text
https://prover.cc3-testnet.creditcoin.network/
```

The probe auto-selected a successful transaction from already-attested Sepolia history:

```text
source tx:
0x8a848420854482e0978b3d6c1345b6a0dfb0263a9620df90ff1a90db18fcbcf6

source block:
11591355
```

The Proof Builder returned a proof package successfully.

## G3 — Creditcoin Block Prover

The proof was submitted through `@gluwa/usc-sdk@0.18.0` to the Creditcoin Block Prover.

```text
proof.chainKey: 1
proof.headerNumber: 11591355
valid proof accepted: true
```

The probe then modified the encoded transaction bytes and submitted the altered proof.

Observed failure:

```text
Merkle proof validation failed
```

Canonical interpretation:

```text
valid proof accepted
+
tampered transaction proof rejected
```

Therefore G3 passes.

## Scope Boundary

This evidence proves the live Attestcoin transport/proof boundary required before Cleara protocol implementation:

```text
Creditcoin RPC reachable
live ChainInfo reachable
Sepolia source support confirmed
Ethereum Mainnet source support confirmed on CC3 testnet
hosted Proof Builder works
valid proof verifies
mutated proof fails
```

It does NOT prove:

```text
Cleara ClaimASC semantics
receipt.status validation in a Cleara gateway
source contract/event binding
claim validity
financeability
capital commitment
facility capitalization
obligation clearing
settlement
```

Those remain future milestones.
