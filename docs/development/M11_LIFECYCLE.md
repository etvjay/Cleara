# M11-Lifecycle — Source Commitment Terminal State

Status: `IMPLEMENTED_LOCAL` (testnet evidence gate pending)

M11-Lifecycle is the follow-on protocol slice to the tested M11 settlement
round-trip. It synchronizes a source-chain `CapitalConsumed` or
`CapitalExpired` event into the canonical Creditcoin financing state. It does
not add settlement execution, Attestcoin writability, or an indexed read model.

## Canonical path

```text
source CapitalConsumed / CapitalExpired receipt
        -> Attestcoin native proof
        -> CommitmentLifecycleASC exact event gate
        -> EvidenceRegistry lifecycle evidence
        -> CommitmentRegistry terminal state
        -> AllocationManager terminal state
        -> FacilityManager terminal accounting
        -> evidence consumed atomically
```

The ASC is deliberately separate from `CommitmentASC`: the original gateway
proves the `CapitalCommitted` observation and creates an ACTIVE Creditcoin
commitment; the lifecycle gateway proves one later terminal event and advances
that existing commitment exactly once.

## Accepted source facts

The proof must identify the configured source chain key, active readable
commitment/evidence domain, configured source vault, successful receipt, and
exactly one lifecycle event:

* `CapitalConsumed(bytes32 sourceCommitmentId, address recipient, uint256 amount)`
* `CapitalExpired(bytes32 sourceCommitmentId, address provider, uint256 amount)`

The event signature, topic count and canonical indexed-address encoding, event
data length, source commitment identity, amount, and actor are checked. The
Creditcoin commitment must be ACTIVE and its allocation must be COMMITTED with
matching facility, provider, and amount. Wrong-chain, wrong-contract,
failed-receipt, missing/ambiguous event, malformed payload, replay, and
identity-mismatch paths revert without state mutation.

## State transition

```text
CommitmentRegistry: ACTIVE -> CONSUMED | EXPIRED
AllocationManager:  COMMITTED -> CONSUMED | EXPIRED
```

`CommitmentRegistry` records the lifecycle evidence id, actor, and Creditcoin
observation timestamp. Lifecycle evidence is registered and consumed by the
ASC in the same transaction as both state transitions; a failed downstream
transition rolls back the evidence registration and all state changes.

## Accounting invariant

`FacilityManager.committedAmount` is the gross amount used by the M7
capitalization seal and is never decremented by a later lifecycle observation.
Terminal totals are tracked separately:

```text
activeCommittedAmount = committedAmount - consumedAmount - expiredAmount
```

Every terminal recording requires the terminal total to remain no greater than
the gross committed amount. This preserves the immutable historical seal while
making active versus terminal source capital auditable.

## Promotion gate

Promotion to `TESTED_TESTNET` requires a fresh workflow on the current head
with both a consume fixture and an expiry fixture. Each artifact must show:

* native source receipt and Attestcoin proof accepted;
* exact Creditcoin commitment/allocation terminal state;
* gross, consumed, expired, and active facility amounts reconciled;
* lifecycle evidence consumed;
* replay and semantic negative cases rejected; and
* an independent validator result of `PASS`.

Until that gate passes, M11-Lifecycle remains local implementation only and
does not change the M11 testnet claim.

The live fixture may create the matching ACTIVE Creditcoin commitments directly
as a prerequisite; M6 remains the separately evidenced gate for
`CapitalCommitted -> CommitmentASC -> ACTIVE` synchronization. M11-Lifecycle
spends its Attestcoin proof budget on the two terminal source receipts.
