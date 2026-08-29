# ADR-0001: Use Proof-Native Coordinates for Evidence Identity

## Status
ACCEPTED

## Context

The original Cleara design derived an evidence ID from:

```text
(domainId, chainKey, blockHeight, txHash, eventIndex)
```

During M3 implementation against the live Attestcoin native verifier, we confirmed the onchain proof surface cryptographically authenticates:

```text
chainKey
block height
encoded transaction + receipt
Merkle path
continuity proof
```

and exposes `calculateTxIndex(merkleProof)`.

The source EVM transaction hash is useful offchain provenance, but it is not a distinct authenticated argument returned by the native verifier interface. Accepting a caller-supplied tx hash into canonical evidence identity would therefore allow a correct proof to be annotated with a false tx hash.

## Decision

Cleara canonical onchain evidence identity is changed before any deployment to:

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

The record additionally stores:

```text
encodedTransactionHash = keccak256(encodedTransaction)
```

where appropriate, binding the evidence record to the exact proven encoded payload.

Offchain evidence bundles may also store the conventional source transaction hash obtained from the source RPC, but that hash is provenance metadata unless independently reconstructed/verified onchain.

## Why this is stronger

`txIndex` is derived from the same Merkle proof the Creditcoin Block Prover validates. Therefore the replay identity is anchored to proof-native facts rather than caller metadata.

## Canonical Impact

This supersedes the draft `CLEARA_EVIDENCE_V1` identifier based on `txHash` in the Supreme Design Specification.

No deployed Cleara state exists, so no migration is required.

## Security Impact

Prevents:

```text
same proven transaction being assigned arbitrary source tx hashes
misleading evidence provenance
caller-controlled evidence identity divergence
```

## Ground Truth Impact

M2 remains `IMPLEMENTED_LOCAL`, but its EvidenceRegistry is revised and must re-pass CI before M3 is promoted.
