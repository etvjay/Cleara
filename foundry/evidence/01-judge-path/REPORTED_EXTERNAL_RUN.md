# Reported External Run Intake

**Evidence state:** `REPORT_ONLY`

**Source:** operator report supplied after the bounded runner completed.

**Important:** This file records a report for reconciliation. It is not an independent chain, provider, or hosted-deployment readback. Do not promote claims based on this file alone.

## Source identities reported

- Contract/runner candidate: `26ecf9e2062eaa22d5c35932ac2a1b51468a6074`
- UI candidate: `f227e5d23494f79e4e5a62a79171f286720a0a28`

## Reported testnet deployment addresses

- MockERC20: `0xA98Aab287246b8484168Aa7538BE911FB45172F5`
- CapitalCommitmentVault: `0x760caf59A7FF095598aa1376140774a7538590C8`
- SettlementAdapterV2: `0xD9cCCdDdFAf34b6F16dB33b934a03554813A7f6e`
- SettlementASCV2: `0x2d7aD6422F6c64d781441FAA2623EA5314Ac68d1`

## Reported final proof transaction

`0x979b7587790f8e22afd6194b28da3273916d935f0449d3d4f51b847a6f55e9dc`

## Reported execution

- Sepolia and CC3 testnet writes: `70/70`
- Reported bounded split: `9 Sepolia`, `61 CC3`
- Reported final identity and state readbacks: passed

## Reported Pages delivery

- Project: `cleara`
- Stable URL: `https://cleara-9a8.pages.dev`
- Reported files deployed: `229`
- Immutable URL: `https://9ff83800.cleara-9a8.pages.dev`
- Environment observation: immutable URL TLS handshake failed; stable URL was reported verified.

## Reconciliation required

Before promoting the external claims, independently read back:

- chain IDs and signer identities;
- deployment receipts and finalized blocks;
- runtime bytecode hashes;
- constructor and immutable bindings;
- all final proof and reconciliation receipts;
- nonce and state deltas;
- UI deployment/source identity;
- the exact evidence packet produced by the runner.
