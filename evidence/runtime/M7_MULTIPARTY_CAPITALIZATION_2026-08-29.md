# M7 Multiparty Capitalization — Live Testnet Evidence

Date: 29 August 2026
Status: PASS
Milestone: M7 Multiparty Capitalization

## Execution

GitHub Actions run: `33274674575`
Head exercised: `e869ae45688fcfd0a09d5c92038323491b3cf8ba`
Artifact ID: `9721384433`
Artifact SHA256: `76d92928df25c366faf03165764b94ecf2c82e8a45f80643996d79b20a6731a2`

Build/property gate:

```text
forge fmt --check PASS
forge build --sizes PASS
forge test -vvv PASS
42 tests passed
0 failed
0 skipped
```

M7 fuzz properties each passed 1,000 generated cases:

```text
exact three-provider splits always conserve target and seal deterministically
short-horizon member cannot mutate or seal capitalization
duplicate commitment membership cannot seal
```

## Networks

```text
Sepolia chainId: 11155111
Sepolia deployer: 0x04A9351c40748348f4a4e012d21b2Bd775a5d484
CC3 chainId: 102031
CC3 signer: 0x5ac98dc6f8408564645f36195aC0F9c5B1c0C0C8
```

## Evidence Deployments

### Sepolia

```text
MockERC20:              0x99232978f7f9E01B7f58608057e417459267B085
CapitalCommitmentVault: 0x0DBa84A9F8226c5CA4A60Ed1B75ee69E7E628be6
```

### Creditcoin CC3

```text
DomainRegistry:         0x5e6708c70e3216b1312b54794BB470867aFE95Ed
AssetRegistry:          0x027f86706b6994078Dc8D09E2179D594245dC5D6
EvidenceRegistry:       0xF462865962ef5a8c4dF79b45998A024C3DEb2336
ClaimRegistry:          0xfA365e09d34Cd249eED75dd7645eE7429f9f6B03
EncumbranceRegistry:    0x7276Dc326978261AD5A74c24587301FBF9b911D2
FacilityManager:        0xa9662e17409976Cc2886404394ab8714E7bC7224
AllocationManager:      0xb8d3be9F35a8106924b893b22d1E9F87EEA3d99a
CommitmentRegistry:     0x2d113e170290Eba8b9212eB06AD104B0fDc7d004
CommitmentASC:          0xe41c91aeBBfC453ddC415a817c5704953781ae53
CapitalizationManager:  0x426270600528F5046756650337Dc46b58479A2aA
```

## Canonical Objects

```text
claimId:
0x5e4e90673e241101fb9552d494cb024a46decdf1410bc5778eae851b39a8eab4

facilityId:
0x772ed1527b2137634f30da4dd62245906719b697dc7ca0bd27e11a8a2d5c7a73

encumbranceId:
0x00eab0962186c1bf87a1c111d8ce70e23cc1b8571ae61e4455d323d42319107a

assetClassId:
0x1cda873901f7e3d40e3c769bad5e796dde83cc8879f8425ac25ac3ff12fbeb77

representationId:
0x4040339c50becd8df629ab05f7157b01d72e55f23df5afdf65e58aba1f596c07

capitalizationRoot:
0x1ca109babcb91c33eb6124d1693b27fe6d9397cfa0730e56ce765feb3ae0f512

capitalRequiredUntil:
1788123587
```

## Multiparty Source Commitments

Three independent ephemeral Sepolia provider wallets were generated only inside the runner. Their private keys were not persisted or emitted.

### Provider A

```text
address: 0x8766760e375bD43f600D23C40aDCeeDD62a60e2b
amount: 400,000
allocationId: 0xd6b410ef29e293cf6b4427601a4bc5e4e9a313a29f01310def95e27b4d1f9344
sourceCommitmentId: 0xf5eae28ca80619c19be171c3b36f4f4d383c67639ba9a29e6d532ddbbeec1c74
source tx: 0x8146baf1c7e34dc16c3de9df604a39a204396888b240cdbb2d5898d3da6d54fd
source block: 11594330
commitmentId: 0x8463e8636af68324544180b3269b4ae2ffe91784fe775257acd6451cb2ba0f51
evidenceId: 0xc9a804fe9fe6af0cc764e1221599ea1b4b5db73a19daca9a228e19910937a894
```

### Provider B

```text
address: 0x9c97121F58967a5D4E060467aa4ec704A4c20D8c
amount: 350,000
allocationId: 0xb65783f406d3df25fcca780418bdb7579395f0ad46a469342acd04b87d925046
sourceCommitmentId: 0x2c1792fca303ae97db859be5305f85bc02ec9e1573e99f21b459141efe72782d
source tx: 0x17b00eb13a381e9aff1367878dab37d655ba1df3722bd3ec6095751ef3043d2b
source block: 11594334
commitmentId: 0x846e3f6c64bf566a2d192926951a390f639139ec361b79471f547312d74b32df
evidenceId: 0xb296b0548032272af935419aec340eff6f322f7556a87f988c2c81969a89a87d
```

### Provider C

```text
address: 0xA4498B69683178ab46133BEc4A140de670A0C2D2
amount: 250,000
allocationId: 0x7354e824a3958847d18f321c5b126156d05de89f41105ed6b16860a91a54f143
sourceCommitmentId: 0xa05aa6dbdef26466445ddd940eb2fbe986d8c8839165edafcfeb279c23de4c4a
source tx: 0x1436f52923ea58a0f74d0659d5b6d341d2ee9fb7109112e0bdf966dc44752b24
source block: 11594337
commitmentId: 0xa243ce5c6b6c0504d07faab496da5df56595a8a3667dea2b582fe21c4494c6fa
evidenceId: 0x0c5dd2296f9044acdd04c3a12f448fe339f1c7d0ce6c1b89fdda13e0211fe0d6
```

Aggregate source result:

```text
vault balance: 1,000,000
aggregate committed: 1,000,000
commitment expiry: 1788296387
```

## Attestcoin Observation

The three source transactions were mined at Sepolia blocks `11594330`, `11594334`, and `11594337`. The Proof Builder advanced sparse attested heights through `11594300`, `11594310`, `11594320`, and `11594330` before all three commitments became provable.

This independently reinforces:

```text
source transaction inclusion != immediate Attestcoin proof availability
```

## Creditcoin Capitalization Result

Final facility accounting:

```text
FacilityStatus: CAPITALIZED
encumberedAmount: 1,000,000
allocatedAmount:  1,000,000
committedAmount:  1,000,000
commitmentCount:  3
sealTotal:        1,000,000
capitalizationRoot:
0x1ca109babcb91c33eb6124d1693b27fe6d9397cfa0730e56ce765feb3ae0f512
```

The capitalization root is therefore bound to an exact ordered membership set of three verified commitments rather than inferred from aggregate accounting alone.

## Live Negative Paths

All rejected:

```text
direct FacilityManager finalization
duplicate commitment membership
invalid capital horizon
capitalization reseal
```

## Proven Semantic Boundary

M7 proves on testnet:

```text
three independent source-chain capital commitments
-> three Attestcoin proofs
-> three ACTIVE CommitmentRegistry entries
-> three COMMITTED allocations
-> exact target conservation
-> strict commitment-set validation
-> immutable capitalization root
-> CAPITALIZING -> CAPITALIZED
```

It supports the stronger invariant:

```text
CAPITALIZED != committedAmount == target alone
CAPITALIZED == a validated, horizon-safe, immutable commitment composition
```

## Limitations

- The prerequisite claim/financeability/facility state was created directly on CC3 to isolate M7.
- M3, M4, M5, M6, and M7 are independently proven milestone boundaries; this run is not yet one uninterrupted full-stack lifecycle.
- M7 proves current ACTIVE commitment facts at sealing time; later source release/expiry/consumption synchronization remains a separate lifecycle requirement.
- The run uses test ERC-20 capital on Sepolia.
- No drawdown or financial obligation was created.
- These are evidence deployments, not production contracts.
