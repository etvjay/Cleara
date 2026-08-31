# ADR-0002 — Cross-chain message receiver boundary

Status: ACCEPTED FOR FUTURE INTEGRATION

Date: 2026-08-31

## Context

Cleara M11 uses Attestcoin Readability only. Creditcoin testnet does not currently provide Attestcoin Writability for the hackathon path, so no current Cleara milestone may depend on outbound Attestcoin messages.

The expected future write model is message-centric: a Creditcoin dApp sends an opaque payload through an Outbox, attestors/relayers deliver it to a destination Inbox, and the destination application authenticates the delivery path before consuming the payload. Delivery ordering is not assumed. Application-level replay/order semantics remain the receiving dApp's responsibility even if the protocol prevents duplicate Inbox delivery.

## Decision

Cleara will not couple application contracts directly to a specific future Inbox implementation.

The future boundary is:

```text
Cleara application
    -> Attestcoin Outbox
    -> delivery / optional relayer
    -> destination Inbox
    -> ClearaMessageReceiver
    -> domain-specific Cleara adapter / application
```

`ClearaMessageReceiver` is the protocol translation boundary. It authenticates the currently configured Inbox, decodes a versioned Cleara application envelope, performs application-level replay/order checks, and then invokes the destination Cleara adapter.

Destination application contracts trust only an authorized receiver, not arbitrary relayers and not arbitrary callers claiming to be the Inbox.

## Envelope

Attestcoin transports opaque payload bytes. Cleara therefore owns its application envelope. For EVM-to-EVM delivery the initial encoding is ABI, versioned independently of Attestcoin:

```solidity
struct ClearaMessageV1 {
    uint8 version;
    uint64 sourceChainKey;
    bytes32 sourceDomainId;
    address sourceApplication;
    uint64 lane;
    uint64 nonce;
    bytes32 messageType;
    bytes payload;
}
```

The protocol must not infer ordering from delivery time. If a workflow requires ordering, `(sourceDomainId, sourceApplication, lane, nonce)` defines the application replay/order lane.

## Authentication and replay

1. Receiver requires `msg.sender == configuredInbox`.
2. Receiver authenticates the original source application using the source identity exposed by the write protocol when available.
3. Cleara maintains its own consumed-message identity, derived from the authenticated source plus lane/nonce/message digest.
4. A message is consumed at most once by Cleara even if a future transport changes retry behavior.
5. Unordered message types may use independent nonces or digest replay protection. Ordered message types must explicitly enforce monotonic lane nonces.

## Reentrancy

Message delivery is an external execution boundary. Receiver and downstream adapters must follow checks-effects-interactions and use explicit reentrancy protection where state mutation plus external calls occur. A message must be replay-locked before invoking downstream external execution when doing so cannot create an unrecoverable false-positive state transition.

## Upgradeability and protocol evolution

The Inbox/Outbox interfaces and governance are not final. Cleara therefore separates transport trust from application semantics.

Preferred evolution pattern:

- immutable financial-state contracts where practical;
- replaceable/versioned receiver contracts;
- explicit receiver authorization in application contracts;
- multiple receiver versions may coexist during migration;
- transport-specific logic never becomes canonical financial-state logic.

A future Inbox upgrade should require replacing/authorizing a receiver or changing receiver configuration, not rewriting Cleara's core financing/clearing semantics.

## Current M11 consequence

M11 remains Readability-only:

```text
Sepolia SettlementAdapter
    -> successful ERC-20 transfer + SettlementExecuted
    -> Attestcoin proof
    -> SettlementASC
    -> SettlementReconciler
    -> residual / obligation settlement
```

No current contract or public claim may state that Attestcoin Writability, Inbox/Outbox delivery, relayer sponsorship, or destination message execution is live.

## Evidence rule

For current ERC-20 settlement proofs, Cleara does not use transaction `from` as payer identity. The attested receipt must have `status == 1`, and the actual token payer is derived from ERC-20 `Transfer` topic `topics[1]`. The matching transfer must agree with the routed residual's debtor, creditor, token, and amount.
