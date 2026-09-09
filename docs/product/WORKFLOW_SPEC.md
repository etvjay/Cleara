# Cleara Workflow Specification

Status: `PROPOSED / HYPOTHESIS`

## Primary workflow: clear before settlement

### Inputs

- finalized obligation pair;
- facility and counterparties;
- clearing policy and explicit bilateral authorization;
- gross amount `460000`;
- cleared movement `120000`;
- expected residual `340000`;
- source settlement domain and token;
- payer, creditor, amount, deadlines, and authority roles;
- source receipt and finality observation;
- Attestcoin proof/evidence coordinates;
- Creditcoin canonical state and reconciliation requirement.

### Sequence

1. **User action:** sponsor selects the finalized obligation relationship and submits/requests authorized bilateral clearing through the permitted role.
2. **Creditcoin validation:** policy, counterparties, obligation finality, authority, and conservation rules are checked.
3. **Canonical transition:** Creditcoin records the bilateral clearing result.
4. **Accounting effect:** gross `460000` is reduced by cleared movement `120000`; economic residual is `340000`.
5. **Route:** Creditcoin records a residual route. State is `ROUTED`, not settled.
6. **Source execution:** the settlement adapter performs native movement of `340000` on the source domain.
7. **Observation:** the receipt, payer, recipient, token, amount, domain, block, and receipt status are read.
8. **Finality:** the source observation is held until the configured finality policy is satisfied.
9. **Attestcoin proof:** inclusion and continuity are proven; proof does not supply financial authorization.
10. **Creditcoin validation:** the evidence is checked against the route, obligation, residual, source receipt, and permitted authority.
11. **Canonical transition:** evidence is accepted/consumed and reconciliation marks the residual `RECONCILED`.
12. **Terminal outcome:** settlement becomes `SETTLED` only when every invariant agrees.

## Settlement invariant

`SETTLED` requires all of:

1. settlement evidence exists;
2. source receipt success is verified;
3. payer, recipient, token, domain, and amount match;
4. Attestcoin evidence is accepted and consumed;
5. canonical Creditcoin state agrees;
6. reconciliation is true.

## Failure workflow

- `PENDING_SOURCE`: source event observed but finality is insufficient. Block proof and downstream action. Recovery: source observer/operator.
- `PENDING_PROOF`: source is final but Attestcoin evidence is not accepted. Block canonical recognition. Recovery: proof worker/operator.
- `MISMATCH`: source/proof/coordination/accounting values disagree. Freeze downstream action. Recovery: reconciliation owner.
- `STALE`: projection freshness is insufficient. Do not assert current state. Recovery: indexer/operator refresh.
- `REORG_DETECTED`: source block hash changed before finality. Halt lane and replay from last final checkpoint.
- `REJECTED`: authority, evidence, receipt, or semantic validation failed. No retry without correcting the rejected input.

## Accounting example

```text
gross obligations       460000
cleared movement         120000
residual                 340000
debtor                   340000 -> 0
creditor                 0      -> 340000
```

The values are demonstrated testnet/fixture values, not production capital claims.

## Replay and race rules

- A source or evidence identity is idempotent; replay cannot apply accounting twice.
- A clearing epoch and residual route cannot be created twice.
- A failed receipt cannot mutate canonical settlement accounting.
- A reorg before finality invalidates the provisional observation and requires replay.
- A late proof cannot bypass an amount, party, token, domain, or authority mismatch.
- A projection may report uncertainty but may not authorize a transition.
