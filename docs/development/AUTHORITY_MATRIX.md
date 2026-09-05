# Authority Matrix

Status: `DESIGN_ONLY`

This matrix keeps liveness tooling, evidence, and financial authority
separate. A component may observe or retry a workflow without being allowed to
invent a financial transition.

| Actor or system | May do | May not do |
| --- | --- | --- |
| Source-chain participant wallet | Sign the native commitment or settlement action for its domain | Create a Creditcoin state transition without the required proof/role |
| Creditcoin role wallet | Call the authorized CC3 contract transition in its granted scope | Bypass evidence, facility policy, amount limits, or terminal-state rules |
| Attestcoin readability | Prove source inclusion/continuity and expose evidence coordinates | Decide financial meaning, identity, creditworthiness, or authorization |
| Indexer/projection | Observe logs, apply deterministic folds, expose provenance and uncertainty | Sign, submit, verify, or overwrite canonical financial state |
| Workflow/worker | Retry bounded evidence work, wait for finality, and report failures | Treat submission as settlement or suppress a mismatch/reorg |
| Operator | Replay or quarantine failed work and record an operator action | Override an on-chain state or edit a projection into agreement |
| Auditor/observer | Read public or explicitly permissioned evidence and export provenance | Mutate protocol state or approve its own exception |
| Agent/integration | Use a scoped credential for explicitly permitted reads/actions | Receive or store a raw private key; expand its mandate implicitly |
| GitHub Actions | Run testnet gates with repository/environment secrets | Expose deployer keys in source, logs, UI, or artifacts |

## Connection rule

The webapp connects a participant to the wallet/domain needed for a specific
native action. It does not require every user to connect a CC3 wallet, and it
never asks for a private key. Organization identity, wallet ownership, and
cross-chain address linking are separate explicit relationships.

## Recovery rule

Replay, retry, and reconciliation are operational actions. They can cause a
new observation or a new authorized transaction, but they cannot rewrite a
historical event, mark an unproven fact as final, or change canonical state
without the same on-chain authority and evidence requirements as the original
transition.
