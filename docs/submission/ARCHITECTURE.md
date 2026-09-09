# Cleara Architecture

## Runtime truth

```text
Source-chain native action
        ↓
source receipt / event
        ↓
Attestcoin readability and proof
        ↓
Creditcoin ASC and registry transition
        ↓
canonical Creditcoin coordination state
        ↓
read-model adapter / projection
        ↓
read-only institutional workbench
```

Creditcoin is the canonical coordination and financial-state environment. The read model never authorizes, signs, submits, or replaces a Creditcoin contract state transition.

## Submission implementation

The submission adds a small `apps/web` package with:

- `src/case.ts`: deterministic fixture/read-model adapter and shared case graph;
- `src/browser.ts`: read-only role views and evidence panel;
- `public/index.html` and `public/styles.css`: deployable static surface;
- `test/case.test.ts`: shared graph, accounting, settlement, continuity, investigation, and secret-scan tests;
- `scripts/build.mjs`: deterministic TypeScript/static build;
- `scripts/serve.mjs`: minimal local static server.

The app is deliberately framework-light. It introduces no wallet SDK, RPC signer, API server, database, worker, or contract write path.

## Shared case graph

The case graph is one object reused by all three role views:

```text
case:composite:m3-m11-lifecycle
```

This ID is a read-model identifier only. It is not a facility ID, commitment ID, evidence ID, transaction hash, or financial authority.

The graph contains stages for:

```text
claim
→ capacity
→ encumbrance
→ facility
→ allocations
→ commitments
→ capitalization
→ obligations
→ clearing
→ residual
→ route
→ native settlement
→ Attestcoin evidence
→ Creditcoin reconciliation
→ terminal lifecycle
```

It also contains explicit investigation items for `PENDING_PROOF`, `MISMATCH`, and `REORG_DETECTED`.

## Evidence composition

The case is labeled `composite_fixture` because it combines separately evidenced M3–M11 and M11-Lifecycle runs. It does not claim one uninterrupted M3→M11 deployment lifecycle.

Every important stage carries evidence references and bounded explanations. `SETTLED` is derived only when source settlement, proof, and reconciliation states agree.

## Capability model

The capability matrix distinguishes:

- Creditcoin canonical coordination;
- Sepolia native source and settlement execution;
- Attestcoin readability;
- Ethereum Mainnet readability substrate without settlement evidence;
- unsupported Base, Arbitrum, and BNB domains;
- local projection only.

## Deferred boundary

The next production slice remains outside this submission:

```text
RPC/log backfill
→ finality-aware durable checkpoint
→ reorg replay
→ projection
→ API
→ role-gated production surface
```

No M12–M15 or production claim is made by this implementation.
