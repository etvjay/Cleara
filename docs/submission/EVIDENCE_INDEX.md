# Cleara Evidence Index

All links are public GitHub Actions or repository evidence references. The workbench uses these records as provenance labels; it does not claim that the separate runs form one continuous deployment.

| Slice | Evidence | What it supports |
|---|---|---|
| M1 substrate | [Run 33249132447](https://github.com/etvjay/Cleara/actions/runs/33249132447), artifact `9713789625` | CC3, Attestcoin chain mapping, proof substrate |
| M3 claim ingestion | [Run 33253029696](https://github.com/etvjay/Cleara/actions/runs/33253029696), artifact `9715192463` | Sepolia claim proof and verified claim path |
| M4 financeability | [Run 33254529904](https://github.com/etvjay/Cleara/actions/runs/33254529904), artifact `9715412301` | Capacity and encumbrance boundary |
| M5 facility/allocation | [Run 33256911456](https://github.com/etvjay/Cleara/actions/runs/33256911456), artifact `9716144997` | Facility and provider allocation semantics |
| M6 commitment | [Run 33261468561](https://github.com/etvjay/Cleara/actions/runs/33261468561), artifact `9717582867` | Source capital lock, proof, active commitment |
| M7 capitalization | [Run 33274674575](https://github.com/etvjay/Cleara/actions/runs/33274674575), artifact `9721384433` | Three-provider immutable capitalization seal |
| M8 obligations | [Run 33280253700](https://github.com/etvjay/Cleara/actions/runs/33280253700), artifact `9722789518` | Finalized obligations |
| M9 clearing | [Run 33280768286](https://github.com/etvjay/Cleara/actions/runs/33280768286), artifact `9722957475` | Authorized bilateral clearing |
| M10 routing | [Run 33311029527](https://github.com/etvjay/Cleara/actions/runs/33311029527), artifact `9731999552` | Derived residual and route instruction, not settlement |
| M11 settlement | [Run 33614782209](https://github.com/etvjay/Cleara/actions/runs/33614782209), artifact `9841386218` | Payer-validated source settlement, proof, reconciliation |
| M11-Lifecycle | [Run 33699324988](https://github.com/etvjay/Cleara/actions/runs/33699324988), artifact `9873864767` | CapitalConsumed and CapitalExpired lifecycle synchronization |

## Machine-readable manifest

The structured companion manifest is [`evidence-manifest.json`](./evidence-manifest.json). It records explicit evidence levels, evidence modes, chain coordinates, source/proof/coordination fields, reconciliation status, and source documents for each slice. The workbench case remains `COMPOSITE_FIXTURE`.

For the architecture-review mapping, see [`REVIEW_RECONCILIATION.md`](./REVIEW_RECONCILIATION.md).

## Workbench status

- Case source: local deterministic fixture/read-model adapter.
- Case continuity: `composite_fixture`.
- No frontend deployment URL is claimed.
- No production indexer or API is claimed.
