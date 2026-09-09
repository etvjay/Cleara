# Cleara Product Gap Analysis

Status: `PROPOSED / NOT COMPLETE`

## Current implementation assumption

`apps/web` currently assumes a broad read-only institutional casebook: one composite relationship, three role tabs, a timeline, evidence panel, capability matrix, and investigation queue. That is a useful research harness, but it currently treats the role/workbench category as product truth without first selecting the economic relationship.

## Retain

- deterministic fixture/read-model boundary;
- explicit `COMPOSITE_FIXTURE` label;
- fail-closed settlement badge;
- provenance/evidence display;
- pending source/proof, mismatch, stale, and reorg investigation concepts;
- capability-based chain presentation;
- no-wallet, no-write, no-secret boundary;
- evidence manifest and local scan/test tooling.

## Refactor after product decision acceptance

- make the obligation relationship the primary entry point;
- replace generic role-first navigation with sponsor obligation case context;
- show gross, cleared, residual, route, source receipt, proof, reconciliation, and terminal state as one workflow;
- connect every visible state to authority, evidence mode, current state, and permitted action;
- separate the capital-provider lifecycle as a linked supporting view;
- make operator investigation a support mode for the same case, not a second product;
- use continuous evidence records for any future live product path instead of composite fixture composition.

## Remove or avoid

- generic dashboard/KPI framing;
- unsupported chain integrations;
- any write button that implies live authority;
- synthetic portfolio or liquidity charts;
- a broad “institutional workbench” claim without a chosen relationship;
- any UI state that equates route, proof, or observation with settlement.

## Missing product/system work

- accepted actor and role model;
- identity/session and wallet-binding design;
- continuous evidence schema and indexer boundary;
- source finality policy per domain;
- production proof-worker/retry/dead-letter design;
- exact API/read-model contract;
- authorization UX that cannot be confused with observation;
- audit/export receipt requirements;
- operational ownership and SLA for pending/reorg/mismatch states;
- legal/custody/compliance control integration;
- production browser and hosted deployment evidence.

## Decision gate

No additional frontend screens should be built until `PRODUCT_DECISION.md`, `WORKFLOW_SPEC.md`, `DOMAIN_MODEL.md`, and `STATE_AND_AUTHORITY.md` are accepted as one internally consistent product definition.
