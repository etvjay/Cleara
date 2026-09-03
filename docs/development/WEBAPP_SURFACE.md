# Cleara Webapp Surface

Status: `PROPOSED` (experience design; no frontend implementation claim)

This specification turns Cleara's protocol and evidence boundary into a usable
participant and operator surface. It is intentionally chain-neutral. Cleara is
not presented as a bridge or a universal wallet.

## Product stance

The app should answer one question immediately:

> What is the state of my relationship, capital, obligation, and evidence across
> the domains involved?

The chain is context, not the product's top-level navigation. A participant
should see a facility, commitment, obligation, or settlement and then see which
source chain produced the fact, which Attestcoin proof supports it, and which
Creditcoin transition is canonical.

`Relationship` is a participant-facing read-model grouping of parties and
protocol records. It is not a new financial authority or a replacement for the
canonical facility, commitment, obligation, evidence, or Creditcoin records.

The app must preserve these distinctions:

```text
source observation != proof
proof != financial authorization
submitted != settled
balance != capital commitment
allocation != commitment
economic residual != settlement instruction
database/read model != canonical financial state
```

## Who can connect

"Connect" means connect the account or capability needed for the action. It
does not mean every participant must connect a Creditcoin wallet.

| Actor | Connection | What they can do in the participant app |
|---|---|---|
| Capital provider | Source-chain wallet for the relevant domain | View allocations and commitments; sign a native capital commitment; inspect consume/expire evidence |
| Facility sponsor / debtor | Source-chain wallet for native settlement; optional Creditcoin wallet when holding a coordination role | View facilities and obligations; sign a source settlement; inspect residual and reconciliation state |
| Creditor / counterparty | Source-chain wallet for receipt/settlement context; optional read-only coordination session | View obligations, settlement status, and evidence relevant to the relationship |
| Coordinator / protocol operator | Creditcoin wallet with the on-chain role plus operator authentication | Manage facilities, allocations, policies, domains, assets, adapters, proof intake, and reconciliation in a separate operator surface |
| Auditor / observer | No wallet required for public/read-only records; organization login for permissioned records | Inspect lifecycle, proof coordinates, finality, and source/coordination links without mutation authority |
| Integration or agent | Scoped API/SDK/MCP credential and explicit mandate | Request reads or bounded actions; never paste a private key into the UI |

The UI must not infer that two equal hexadecimal addresses are one identity
across chains. Linking wallets or organization members is an explicit,
signed/authorized relationship and is displayed as such.

## How a source-chain participant uses Cleara

```text
1. Open a relationship, facility, or invitation link.
2. Connect the wallet for the source domain that owns the action.
3. Review the exact native-chain action and its capability/evidence requirements.
4. Sign on the source chain; Cleara does not turn this into a bridge action.
5. Track receipt inclusion and finality.
6. Wait for Attestcoin proof acceptance when the workflow requires it.
7. See the Creditcoin canonical transition and any settlement/reconciliation result.
```

For example, a provider on Ethereum Sepolia connects Ethereum Sepolia to commit
capital. The provider does not need a CC3 wallet merely to create that native
source fact. The app then shows the same commitment as `PENDING_PROOF` until
Attestcoin evidence is accepted and as `ACTIVE`/`COMMITTED` only when the
Creditcoin state has advanced. A later `CapitalConsumed` or `CapitalExpired`
receipt appears as a new source event, proof, and terminal Creditcoin state.

## How other chains appear

Do not render chains as a flat list of interchangeable networks. Render domains
with explicit capabilities and contexts.

### Connection/capability view

The Connections page (participant) or Domains & Assets page (operator) shows:

| Domain | `chainKey` | EVM chain ID | Role in Cleara | Attestcoin readability | Settlement/execution reach | Evidence status |
|---|---:|---:|---|---|---|---|
| Creditcoin CC3 | — | 102031 | Canonical coordination and financial state | Not a source proof domain | Coordination contracts | Testnet contracts/evidence |
| Ethereum Sepolia | 1 | 11155111 | Source commitment and settlement execution | Readable | Native source actions; M11 testnet route evidence | Current-head M11/M11-Lifecycle evidence |
| Ethereum Mainnet | 3 | 1 | Supported source readability substrate | Chain support verified in M1 | No current Cleara settlement evidence claim | Readable substrate; workflow support not proven |
| Base / Arbitrum / BNB Chain | — | — | Not enabled for the current slice | Not verified by Cleara's current boundary | No supported action | `UNSUPPORTED` |

The last row can be shown only when a user tries to add an unsupported domain or
when an operator inspects capability coverage. It should not be presented as a
connected or verified Cleara network.

### Per-record chain presentation

Every relationship detail uses a domain-separated lifecycle strip:

```text
Ethereum Sepolia
  CapitalCommitted / CapitalConsumed / CapitalExpired
          ↓
Attestcoin Readability
  proof coordinates, receipt status, query/evidence consumption
          ↓
Creditcoin CC3
  ACTIVE / CONSUMED / EXPIRED, allocation and facility accounting
          ↓
Settlement domain (when applicable)
  native execution → proof → reconciliation → SETTLED
```

Each event card shows the domain name, `chainKey`, EVM chain ID, contract,
transaction hash, block/finality, and whether it is merely observed, attested,
or reflected in canonical Creditcoin state. The same chain may appear twice in a
timeline with different roles; that is expected and must remain visible.

## Information architecture

### Public surface

`/` is an explanation and trust surface, not the app shell:

1. Hero: coordinate obligations across domains; move only what remains.
2. Live execution flow: source action → Attestcoin evidence → Creditcoin state → residual settlement.
3. Boundary panel: not a bridge, not custody, not proof-as-authorization.
4. Testnet evidence: M11 and M11-Lifecycle, with explicit evidence limits.
5. CTA: `Open workspace` and `Read protocol`.

### Participant app

```text
/app
├── overview
├── relationships
│   └── :relationshipId
├── facilities
│   └── :facilityId
├── commitments
│   └── :commitmentId
├── obligations
│   └── :obligationId
├── evidence
│   └── :evidenceId
├── activity
├── settings
│   ├── connections
│   └── access
└── help / protocol
```

`Overview` is the hub. `Relationships` is the participant mental model;
facilities, commitments, obligations, and evidence are progressively more
specific views of the same lifecycle.

### Operator app

```text
/ops
├── queue              # pending proof, pending source, mismatch, reorg
├── facilities
├── obligations
├── domains-and-assets
├── adapters-and-routes
├── evidence
├── reconciliations
├── workflow-runs
└── access / audit-log
```

This is a separate role-gated surface. Operators need operational controls;
participants should not be exposed to registry administration or signer roles.

## App shell and primary screen

The shell has a left navigation rail, a top context bar, and a calm content
workspace. The top bar contains:

```text
workspace / participant
environment: testnet
scope: all relationships | selected relationship
connected domains: source wallet(s) and role
```

The Overview screen contains:

1. **Canonical state banner** — Creditcoin is the financial authority; source
   events and Attestcoin proofs are shown as supporting evidence.
2. **Four summary blocks** — active facilities, gross/active commitments, open
   obligations, and pending proof/reconciliation items.
3. **Relationship list** — parties, facility/obligation, amount, canonical state,
   source domain, and continuity status.
4. **Needs attention** — `PENDING_PROOF`, `PENDING_SOURCE`, `MISMATCH`,
   `REORG_DETECTED`, expiring commitments, and settlement actions that still need
   a native signature.
5. **Recent activity** — event timeline with source/Attestcoin/Creditcoin badges.

This is a coordination workspace, not a token portfolio. A balance may be shown
inside a source transaction, but it must never be labelled committed capital
unless the commitment state says so.

## Detail page contract

Every detail page follows the same hierarchy:

```text
identity and parties
  → canonical state
  → source / proof / coordination lifecycle
  → accounting
  → available action (role + domain)
  → evidence and raw transaction details
```

### Commitment detail

Shows source commitment identity, provider, facility/allocation, asset
representation, amount, expiry, source status, Creditcoin status, lifecycle
evidence, and gross/terminal/active accounting. Actions are native-chain
commit, consume context, or expire where the connected role and current state
allow them.

### Obligation and settlement detail

Shows finalized obligation, cleared amount, economic residual, route instruction,
source settlement transaction, exact payer/recipient/amount evidence, Attestcoin
proof consumption, and the final `SETTLED` transition. `ROUTED`,
`SETTLEMENT_PENDING`, and `SETTLED` must never collapse into one success state.

### Evidence detail

Shows domain, `chainKey`, EVM chain ID, block height, transaction index, event
index, source contract, receipt status, query/evidence IDs, payload hash, and
consumption status. It also states what the proof does not establish.

## State language and failure experience

Use protocol states exactly, with a short explanation beside them:

| Canonical state | Supporting explanation |
|---|---|
| `ACTIVE`, `COMMITTED`, `FINALIZED`, `ROUTED`, `SETTLED` | Current protocol state; show the responsible authority |
| `CONSUMED`, `EXPIRED`, `CANCELLED` | Terminal or cancelled state; show the event and evidence |
| `PENDING_PROOF` | Source fact observed; required Attestcoin/Creditcoin proof path is incomplete |
| `PENDING_SOURCE` | Coordination state exists; required source event is not yet observed |
| `MISMATCH` | Source and coordination facts disagree; action is paused and operator review is required |
| `REORG_DETECTED` | Observed block hash changed; projection is halted until replay/finality policy resolves it |

Every non-success state answers: what happened, what is authoritative, what is
blocked, and who can recover it. A submitted transaction gets a receipt and
finality state, never an automatic `SETTLED` badge.

## MVP implementation boundary

The first frontend slice should be deliberately narrow:

1. Next.js app shell with the participant navigation above.
2. Fixture-backed/read-model-backed Overview.
3. One Commitment detail showing M11-Lifecycle consume/expire proof flow.
4. One Obligation detail showing M11 settlement/reconciliation flow.
5. Evidence drawer with domain-separated coordinates and finality.
6. Connection modal with capability matrix and wallet-scoped action prompts.
7. Explicit testnet and `IMPLEMENTED_LOCAL` labels; no simulated success.

The real indexer/API boundary comes next. Durable RPC backfill, finality policy,
reorg replay, permissioned operator actions, and production observability are
production requirements, not UI decoration.

## Design and implementation handoffs

| Owner | Handoff |
|---|---|
| Interface/API | Projection DTOs, event/evidence endpoints, calldata-returning action APIs, webhook status vocabulary |
| System integrity | Authoritative state queries, finality/reorg semantics, role checks, recovery states |
| Design/frontend | App shell, state badges, responsive detail layouts, wallet prompts, accessibility |
| Security | Wallet/session boundaries, explicit identity linking, operator segregation, mandate/agent credentials |
| Delivery | Build participant read-only slice first; do not claim production indexer or live writes until their gates pass |
