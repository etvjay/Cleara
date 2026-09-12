# Slice D0 source-scope manifest

Status: `CONFIGURED_FOR_LOCAL_DEMO`

- D implementation: `NOT_STARTED`
- D0 source scope: `CONFIGURED_FOR_LOCAL_DEMO`
- Live-read: `NOT_VERIFIED`
- Branch: `verification/slice-d0-source-scope`
- Base: `b84721cfa0673eaff3ff3dc320e31453b3a71484`
- Manifest: `workers/slice-d/source-scope/manifest.json`
- Canonical manifest hash: `4ea1254bd6b60015cfe79bf3c07aacf45464772e1ca6fb33fdbc78bf4ba7e8b8`
- Canonical serialized body length: `2667` bytes
- Parser: `workers/slice-d/source-scope/src/manifest.ts`

## Scope selection

D0 selects the repository-defined `CapitalCommitted` event from
`CapitalCommitmentVault.sol` for a deterministic local fixture scope:

```text
source domain: ethereum-sepolia
chain key: 1
evm chain ID: 11155111
event: CapitalCommitted(bytes32,bytes32,bytes32,address,bytes32,address,uint256,uint64)
selector: 0xead4d892be5ba0cd9d75db59448b9c0cd9d398e8b3275ec31b9c720d9f1de2dd
```

This event family is authoritative for the fixture mode because its Solidity
ABI, indexed topic positions, data fields, and source token behavior are
present in the repository:

- `contracts/source/commitments/CapitalCommitmentVault.sol` defines the event,
  commitment fields, nonzero token and amount rules, and source transition.
- `test/mocks/MockERC20.sol` supplies the deterministic ERC-20 fixture. Its
  OpenZeppelin ERC-20 base uses 18 decimals.
- `evidence/runtime/M6_CAPITAL_COMMITMENT_2026-08-29.md` documents the same
  source event family and historical testnet observation. Its historical
  deployment addresses are not used by this manifest.

The preferred M11 settlement/source-transfer path is not configured for
live-read. The repository has no stable current M11 source token or adapter
deployment manifest. D0 therefore stops at a fixture-only scope rather than
promoting an ephemeral historical deployment into current configuration.

## Fixture identities and mapping

The manifest uses these deterministic identifiers only:

```text
CapitalCommitmentVault: 0x000000000000000000000000000000000000d001
MockERC20:              0x000000000000000000000000000000000000d002
```

They are not live addresses, historical addresses, deployment claims, or RPC
lookup targets. The explicit local mapping is:

```text
CapitalCommitted.sourceCommitmentId
  -> objectId = sourceCommitmentId
  -> relationshipId = relationship:fixture:capital-commitment:{sourceCommitmentId}
  -> objectType = Commitment
  -> scope = RELATIONSHIP_SCOPED
```

This mapping exists only to make a deterministic local Slice B-shaped fixture.
It is not a canonical live relationship mapping and cannot authorize a
financial transition.

## Finality and cursor

The fixture policy is `slice-d-fixture-finality-v1` with a two-confirmation
threshold. The cursor is explicitly `SPARSE_EVENT`, block-based, and bounded
to a maximum range of 1,000 blocks. These are local mechanics, not an
Ethereum production finality claim.

## Strict validation boundary

`parseSourceScopeManifest` rejects:

- missing or unsupported fields;
- wrong source domain, chain key, or EVM chain ID;
- malformed addresses and unsafe values;
- unsupported ABI event or schema versions;
- missing or conflicting relationship mappings;
- fixture/live mode confusion;
- `LIVE_READ` without live deployment fields, live addresses, an available
  status, and a verified live mapping declaration;
- cyclic, proxy-like, accessor, or non-plain input objects.

`serializeSourceScopeManifest` canonicalizes object-key order and returns a
SHA-256 body hash. The checked-in manifest is validated by the D0 test suite.

## Evidence boundary

- D0 manifest: `IMPLEMENTED_LOCAL`
- Historical M6 basis: `FIXTURE_FROM_LIVE_EVIDENCE`
- Live-read availability: `NOT_VERIFIED`
- New source ingestion/backfill: not implemented
- Attestcoin proof: not requested
- RPC writes, signing, broadcasts, deployments, and funds: none

D0 does not claim a production deployment, production indexer, hosted
provider, live backfill, live proof, settlement, or canonical financial state.
