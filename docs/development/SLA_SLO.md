# Service Levels and Operational Targets

Status: `DESIGN_ONLY`

Cleara currently has no customer-facing SLA and makes no production
availability or settlement-time guarantee. The live gates prove bounded
testnet outcomes, not service performance.

## What can be measured now

The current package can verify deterministic local projection behavior and
record provenance for live testnet runs. It cannot honestly measure an
end-to-end production SLO because durable workers, an API, operator paging,
and a production data store do not exist yet.

## Future SLO dimensions

Any production SLO should be agreed with the operating institution and measured
from independent telemetry. At minimum it needs:

| Dimension | Required measurement | Current status |
| --- | --- | --- |
| Read-model freshness | finalized source/CC3 event to indexed observation | Not measured |
| Proof workflow latency | source finality to accepted Attestcoin evidence | Dependency-bound; not guaranteed |
| Reconciliation lag | accepted proof to independent CC3/readback agreement | Not measured |
| Availability | API and operator surface error budget | No production API |
| Durability | checkpoint retention, replay, and backup recovery | No production store |
| Incident response | detection, acknowledgement, escalation, and closure | No operating rotation |

The source chain, Attestcoin services, Creditcoin RPC, RPC providers, wallet
signatures, and external settlement rails are dependencies. Cleara cannot
promise a finality or settlement time that those dependencies do not expose.

## State language

The product must not use an uptime or latency badge to conceal financial
uncertainty. A record remains `PENDING_SOURCE`, `PENDING_PROOF`, `MISMATCH`,
`STALE`, `REORGED`, or `REJECTED` until the required authority and evidence
conditions are satisfied. `SETTLED` is reserved for the canonical transition
plus independently verified settlement evidence.

RTO, RPO, retention periods, error budgets, escalation windows, and support
hours are intentionally undefined until the deployment model, data stores, and
operating owner are selected.
