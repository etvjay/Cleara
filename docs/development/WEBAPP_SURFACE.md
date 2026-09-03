# Cleara Webapp Surface

Status: `PROPOSED` (experience design; no frontend implementation claim)

This specification turns Cleara's protocol and evidence boundary into a usable
participant and operator surface. It is intentionally chain-neutral. Cleara is
not presented as a bridge or a universal wallet.

## Product stance

Cleara is not a dashboard. A source event does not merely appear as a metric; it
changes facility capitalization, available commitment capacity, obligation
state, clearing eligibility, or settlement state. The UI must therefore be
organized around work on a persistent financial relationship and its state
machine.

The primary interaction is:

```text
open a work item
    -> inspect the current state and what caused it
    -> perform an authorized native action or request evidence
    -> verify the next transition
    -> reconcile or recover when the state is incomplete
```

The chain is context, not the product's top-level navigation. A participant
should open a facility, commitment, obligation, or settlement and then see which
source chain produced the fact, which Attestcoin proof supports it, and which
Creditcoin transition is canonical.

`Relationship` and `Work item` are participant-facing read-model groupings of
parties and protocol records. They are not new financial authorities or
replacements for the canonical facility, commitment, obligation, evidence, or
Creditcoin records.

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
├── work                         # default entry; assigned/pending work items
│   └── :workItemId
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
├── connections
├── access
└── help / protocol
```

`Work` is the entry point, not an overview dashboard. It is a queue of specific
relationship, commitment, obligation, evidence, or reconciliation items that
need attention or inspection. `Relationships` is the participant mental model;
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

## App shell and primary workspace

The shell has a left navigation rail, a top context bar, and a three-pane work
workspace. It should feel closer to an institutional casebook or operations
workbench than a dashboard. The top bar contains:

```text
workspace / participant
environment: testnet
scope: selected relationship | selected facility | selected obligation
connected domains: source wallet(s) and role
```

The default Work screen contains:

1. **Work queue** — concrete items such as a proof waiting for maturation, a
   source signature, an expiring commitment, a reconciliation exception, or a
   detected reorg. Each row has an owner, state, reason, age, and next action.
2. **Selected relationship/case** — parties, canonical object, current state,
   and the lifecycle strip for the selected item.
3. **Evidence and authority pane** — source receipt, Attestcoin coordinates,
   Creditcoin observation, finality, accounting, and actions permitted for the
   connected role.

There are no default KPI tiles, portfolio charts, chain heatmaps, or synthetic
"health" scores. Aggregates belong inside a specific reconciliation task or an
export, where their source and uncertainty are explicit.

This is a coordination workspace, not a token portfolio. A balance may be shown
inside a source transaction, but it must never be labelled committed capital
unless the commitment state says so.

## Reconciliation workspace

Reconciliation is an action-oriented work surface, not a dashboard. An operator
opens one facility/provider or obligation and compares:

```text
opening amount
+ commitments / allocations
- consumed
- expired
- released
- cleared
- settled
= remaining
```

The workspace shows the invariant result as `PASS`, `FAIL`, or `UNKNOWN`, lists
the exact unexplained difference, links every input to source/proof/coordination
evidence, and offers export/sign-off only to an authorized role. A mismatch is a
case to resolve, never a zero to hide.

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

1. Next.js app shell that opens on a concrete Work queue, not a dashboard.
2. Fixture-backed/read-model-backed M11 settlement work item.
3. One Commitment work item showing M11-Lifecycle consume/expire proof flow.
4. One Obligation work item showing M11 settlement/reconciliation flow.
5. Evidence pane with domain-separated coordinates and finality.
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
