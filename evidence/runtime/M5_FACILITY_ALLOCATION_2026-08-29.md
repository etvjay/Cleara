# M5 Facility + Allocation — CC3 Testnet Evidence

Date: 2026-08-29
Status: TESTED_TESTNET

## Scope

This evidence isolates M5 facility and allocation semantics on Creditcoin CC3 testnet.

It proves:

- a financeable claim can be bound into a facility through a real encumbrance;
- binding consumes the encumbrance into the facility without freeing claim capacity;
- facility allocation is bounded by both encumbered value and facility target;
- a failed over-allocation does not mutate facility accounting or allocation state;
- cancelling an active allocation restores only allocated capacity and does not release the underlying claim encumbrance;
- an ACTIVE allocation does not become a capital commitment.

It does not prove capital commitment, capitalization, drawdown, obligation creation, clearing, or settlement.

The claim was registered directly through ClaimRegistry for this M5 accounting test. This run does not replace the independent M3 Attestcoin claim-ingestion proof or the M4 financeability evidence.

## GitHub Actions

```text
Run: 33256911456
Head: 59a6c8bf30df24297d6e728fbb1afdf1dba08ac1
Result: PASS
```

Artifact:

```text
ID: 9716144997
Name: m5-facility-allocation-33256911456
SHA256: 8c2a22ac36cb736c723ebf0b4f90e5309be56f7296e2b5e6135603bde3373c27
```

## Build and Property Gate

```text
forge fmt --check   PASS
forge build --sizes PASS
forge test -vvv     PASS

30 tests passed
0 failed
0 skipped
```

M5-specific unit tests:

```text
testFacilityConsumesEncumbranceWithoutFreeingClaimCapacity PASS
testAllocationIsNotCapitalCommitment                       PASS
testAllocationCannotExceedBoundEncumbrance                 PASS
testCancelActiveAllocationRestoresFacilityAvailabilityExactlyOnce PASS
testCannotBindEncumbranceForDifferentFacility              PASS
```

M5 fuzz properties:

```text
testFuzzActiveAllocationNeverExceedsEncumbered   1000 runs PASS
testFuzzCancelRestoresAllocationExactly          1000 runs PASS
testFuzzFailedOverAllocationDoesNotMutate        1000 runs PASS
```

## Network

```text
Creditcoin CC3 testnet
EVM chainId: 102031
RPC: https://rpc.cc3-testnet.creditcoin.network
Signer: 0x5ac98dc6f8408564645f36195aC0F9c5B1c0C0C8
```

## Evidence Deployments

```text
ClaimRegistry:       0x50E03d22fa67Fa1005A1cD626A04B56eaE48E591
EncumbranceRegistry: 0x163c00f3C9A802c3fb47b46263399f491e354Ff9
FacilityManager:     0x92ce1260E35A030580728697667f0F900D514F66
AllocationManager:   0xDDa1DCD9273A8606fCea2b1956287618E1635f53
```

These are test/evidence deployments, not production contracts.

## Objects

```text
claimId:
0x742efe67731a07a200e5db1b6d5d679c2fb115f705a1cafd97a4751dea0e37db

facilityId:
0x23c14b37336bbed837692c60055be9334df208c25ded77f45023ce9134fce1a0

encumbranceId:
0x5ea05212d67fdd460d47c7ccb2bb8b07471ee23ef53114b554743d7d1df9f3f1

allocationAId:
0x6ed251dee24b6f28afb7b52bdaf4f27cf3f26483bb722fa32fb9cf5028faf0fb

allocationBId:
0x986ee218b5db8e9b169b71a95868694ee32062552407441b52a50f93adf6dcaa
```

## Live Accounting Vector

```text
claim face value             100,000,000
financeable capacity          80,000,000
facility target               80,000,000
bound encumbrance             60,000,000
allocation A                  40,000,000
allocation B request          30,000,000 -> REJECTED
allocated after rejection     40,000,000
allocation A cancellation
allocated after cancellation           0
facility encumbered after cancellation 60,000,000
claim active encumbrance               60,000,000
claim available capacity               20,000,000
```

Therefore:

```text
allocatedAmount <= encumberedAmount <= facilityTarget
```

and allocation cancellation does not release the economic claim reservation.

## Semantic Boundary Proven

After activation:

```text
AllocationStatus.ACTIVE    = 2
AllocationStatus.COMMITTED = 3
observed allocation status = 2
```

Therefore the test confirms:

```text
ALLOCATION != CAPITAL COMMITMENT
```

No commitment state transition occurred.

## Negative Paths Verified Live

```text
over-allocation rejected
failed over-allocation preserved facility allocatedAmount
a rejected allocation remained PROPOSED
double cancellation rejected
```

The current ethers surface renders the custom-error reverts as `unknown custom error`; this is a developer-experience issue rather than a correctness failure.

## Transactions

```text
grant ClaimRegistry ENCUMBRANCE_ROLE:
0xe54ac16dd769584234d07d686ce04d01f38f0f1e63c1af977b79c3f1fdb541cd

grant EncumbranceRegistry FACILITY_ROLE:
0xc94251b7aaa32bb6930a60b6ddb186ae1ab3c906b343e4a9cc8e8186b4387fe1

grant FacilityManager role to AllocationManager:
0x90d73b3a11a6392f9b1e148136c1f132ecf10e9adc50e3b97e6daa2f9160f0a7

register claim fixture:
0x9944746aa34eed755efda7284d2d18b6c645c5b961ce606baef844d1109d14d4

set financeability:
0xa5ed3a7bd925d1682019e45a1f7d6c16d47b7af8110bfd66365677e06bb65258

create facility:
0x666ea3cbd930fd19dd97682e12852332deb9f541f18018a4046b84eee2b78c91

verify facility:
0xaf986b6a3239dc73fa3dc24947ebc34e14081045334eea2f9673a331b8c2b5cc

open facility:
0xfa72c39319f9b30d2ccba19ba7d3374ca8a01e9b757b2a2436b7b8cad5644efd

create encumbrance:
0xadeeb45ef1a3316ef7a86d275a0d79941b64c81d1ea3d7496505ae8159df5964

bind/consume encumbrance:
0x7141fbce74b7e02c585c38767502c29d96418c23ff3f29b8792c3b8917f77597

begin allocating:
0xedb0cf225f7ab86d2ec63762c18a092224d4568669b6d33743da874c3b31d3a6

propose allocation A:
0x024a9407da5d3a0f5adaa7f54c66c86024048c72d1f132ed07f7a483cde1b20e

activate allocation A:
0x037648abb653846724e314e24b167dfca7065c00e9688350f0feacb65c14bffa

propose allocation B:
0x068f9be9015352cc16b2b8abad56cf33ac4a6a932b324cc7e124c1f9eb51a3e8

cancel allocation A:
0x60233ab634fe0028451bb0a950e5a20698a6acade80bdaa0c62fa4f971503408
```

## Security / Workflow State

The temporary exact-path push trigger used to start the connected-tool run was removed immediately after execution. The live workflow is restored to `workflow_dispatch` only with read-only repository permissions and the `testnet` GitHub environment.

## Promotion Boundary

M5 may be promoted to `TESTED_TESTNET` for the implemented facility/allocation coordination slice.

This promotion does not authorize claims that:

- lender capital was externally locked;
- any allocation is a capital commitment;
- the facility is CAPITALIZING, CAPITALIZED, or ACTIVE;
- a drawdown occurred;
- a financial obligation exists;
- any clearing or settlement occurred.

The next milestone must introduce the capital commitment boundary before facility capitalization can exist.
