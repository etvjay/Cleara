# Compliance and Integration Boundary

Status: `HACKATHON_BOUNDARY`

This document prevents the protocol demonstration from being mistaken for a
regulated financial service. It is a product boundary, not legal advice or a
compliance certification.

## What this package is

Cleara coordinates evidence-backed financing and clearing state across CC3 and
an exercised source domain. The package demonstrates contract semantics,
Attestcoin-readability integration, source settlement evidence, and a local
read-only projection.

The current demonstration is:

- Creditcoin CC3 testnet (`102031`) for canonical coordination state;
- Ethereum Sepolia (`11155111`) for exercised source commitment and settlement;
- mock/testnet value only;
- non-custodial source-wallet actions;
- no production customer data or personally identifiable information; and
- no production-value or mainnet operation claim.

## What it does not provide

The repository does not implement or certify:

- KYC/KYB, AML, sanctions screening, transaction monitoring, or Travel Rule
  controls;
- licensing, jurisdictional classification, consumer protection, or legal
  enforceability;
- custody, safeguarding, fiat payment execution, or bank settlement;
- accounting/GL posting, tax reporting, or statutory reconciliation;
- privacy, confidentiality, or deletion guarantees for production data;
- production availability, disaster recovery, incident response, or a customer
  SLA; or
- an audit opinion, security certification, or approval to handle real funds.

Attestcoin evidence proves source-chain inclusion and continuity. It does not
perform identity, sanctions, credit, legal, or financial authorization.

## Integration posture after the hackathon

Do not recreate every institutional control inside Cleara. Keep explicit
adapter boundaries for systems that already own those responsibilities:

| Responsibility | Production integration boundary |
| --- | --- |
| Identity and organization access | Enterprise IAM/SSO, wallet policy, and explicit identity linking |
| KYC/KYB/AML/sanctions | Licensed or approved compliance provider and case system |
| Signing and custody | Qualified custodian, MPC, HSM, or institution-controlled signer |
| Accounting and reporting | ERP/GL and reconciliation export with approval workflow |
| Security operations | SIEM, alerting, incident, and evidence-retention systems |
| Network execution | RPC/provider abstraction, source-chain adapters, and approved settlement rails |

Cleara should own the protocol-specific evidence graph, authority checks,
financial-state transitions, reconciliation semantics, and provenance. An
integration may gate a Cleara action, but a provider response must never be
silently treated as on-chain truth.

## Promotion gate

Before any production-value claim, the team must obtain jurisdiction-specific
legal/compliance review, define the operating entity and licensed partners,
complete threat and smart-contract audits, establish privacy/data-retention
controls, and prove operational recovery with real dependencies. None of those
are satisfied by the current testnet evidence.
