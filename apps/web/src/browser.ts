import { isRole, roleSummary, seedCase, settlementBadge, type CaseStage, type Role } from "./case.js";

const graph = seedCase();
let role: Role = "operator";
let selectedStage = graph.stages.find((stage) => stage.id === "reconciliation") ?? graph.stages[0]!;

const appElement = document.querySelector<HTMLElement>("#app");
if (!appElement) throw new Error("missing #app");
const app: HTMLElement = appElement;

function esc(value: string): string {
  return value.replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}

function badge(state: string): string {
  const safeState = esc(state.toLowerCase());
  return `<span class="badge badge-${safeState}">${esc(state)}</span>`;
}

function evidenceBoundary(kind: string): string {
  return kind === "testnet" ? "fixture_from_live_evidence / TESTED_TESTNET" : `${kind} / IMPLEMENTED_LOCAL`;
}

function accountingPanel(): string {
  return `<section class="accounting-panel"><div class="panel-head"><div><span class="eyebrow">ACCOUNTING / RECONCILIATION</span><h2>Residual settlement vector</h2></div><span class="muted">Composite fixture</span></div><div class="accounting-grid"><div><small>GROSS OBLIGATIONS</small><strong>460,000</strong></div><div><small>CLEARED INTERNALLY</small><strong>120,000</strong></div><div><small>RESIDUAL ROUTED</small><strong>340,000</strong></div><div><small>FINAL STATE</small><strong class="accounting-success">SETTLED</strong></div></div><div class="balance-line"><span>Debtor balance <b>340,000 → 0</b></span><span>Creditor balance <b>0 → 340,000</b></span></div><p class="accounting-note">The residual is shown as ROUTED until the native receipt, Attestcoin proof, canonical Creditcoin state, and reconciliation all agree. Values are testnet evidence presented through a local composite fixture.</p></section>`;
}

function referenceHero(): string {
  return `<section class="reference-hero-wrap" id="reference-hero" aria-label="Hero reference study">
    <div class="reference-hero">
      <img class="reference-hero-media" src="assets/hero-luminous.webp" alt="Woman resting in warm red light" />
      <div class="reference-hero-shade" aria-hidden="true"></div>
      <header class="reference-hero-header">
        <a class="reference-brand" href="#workbench" aria-label="Luminous Labs reference home">
          <span class="reference-brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <span>luminous labs</span>
        </a>
        <nav class="reference-nav" aria-label="Reference navigation">
          <a href="#workbench">Technology</a>
          <a href="#workbench">Company</a>
          <a href="#workbench">Commercial</a>
          <a href="#workbench">Blog</a>
          <a class="reference-nav-pill" href="#workbench">Shop</a>
        </nav>
        <div class="reference-utilities">
          <button class="reference-language" type="button" aria-label="Language: English">EN <span aria-hidden="true">⌄</span></button>
          <a class="reference-cart" href="#workbench">Cart</a>
          <a class="reference-bag" href="#workbench" aria-label="Open reference cart"><span aria-hidden="true">⌑</span></a>
        </div>
      </header>
      <div class="reference-hero-copy">
        <p>Red Light Therapy: proven, safe, and non-invasive</p>
        <h1>Your cells, supercharged</h1>
      </div>
    </div>
  </section>`;
}

function render(): void {
  const summary = roleSummary(role, graph);
  const focus = new Set(summary.focus);
  app.innerHTML = `
    ${referenceHero()}
    <header class="topbar" id="workbench">
      <div class="brand"><span class="brand-mark">C</span><span>Cleara</span><small>WORKBENCH</small></div>
      <div class="top-context"><span class="context-dot"></span><span>TESTNET</span><span class="context-separator">/</span><span>${esc(summary.title)}</span></div>
      <div class="top-actions"><span class="read-only">READ-ONLY</span><button id="reset" class="text-button">Reset seed</button></div>
    </header>
    <main class="shell">
      <aside class="rail">
        <div class="rail-label">CASE</div>
        <button class="rail-item active"><span class="rail-icon">⌂</span>Work</button>
        <button class="rail-item"><span class="rail-icon">◌</span>Relationships</button>
        <button class="rail-item"><span class="rail-icon">◇</span>Evidence</button>
        <div class="rail-spacer"></div>
        <div class="rail-label">CAPABILITIES</div>
        <button class="rail-item"><span class="rail-icon">◎</span>Domains</button>
        <button class="rail-item"><span class="rail-icon">?</span>Protocol</button>
      </aside>
      <section class="workspace">
        <div class="workspace-head">
          <div>
            <div class="eyebrow">RELATIONSHIP / WORK ITEM</div>
            <h1>${esc(graph.label)}</h1>
            <p class="subtitle">${esc(summary.question)}</p>
          </div>
          <div class="case-meta"><span class="case-id">${esc(graph.id)}</span>${badge(graph.environment.toUpperCase())}<span class="fixture-label">COMPOSITE_FIXTURE</span></div>
        </div>
        <div class="truth-banner"><span class="truth-icon">i</span><span>${esc(graph.disclaimer)}</span></div>
        <section class="public-explanation"><div><span class="eyebrow">WHAT CLEARA COORDINATES</span><h2>Clear reciprocal obligations before native settlement.</h2><p>Creditcoin coordinates canonical financial state. Source chains execute native actions. Attestcoin proves inclusion and continuity. This read-only casebook connects those facts without turning the projection into authority.</p></div><div class="explanation-flow"><span>obligations</span><b>→</b><span>clearing</span><b>→</b><span>residual</span><b>→</b><span>proof + reconciliation</span></div></section>
        ${accountingPanel()}
        <section class="work-queue"><div class="queue-head"><div><span class="eyebrow">INVESTIGATION QUEUE</span><h2>What needs attention</h2></div><span class="muted">Read-only examples</span></div><div class="queue-grid">${graph.investigations.map((item) => `<article class="queue-item"><div class="queue-top"><strong>${esc(item.title)}</strong>${badge(item.state)}</div><p>${esc(item.reason)}</p><small>Authority: ${esc(item.authority)} · Blocked: ${esc(item.blocked)}</small><small>Recovery: ${esc(item.recoveryRole)} · Next: ${esc(item.nextAction)}</small></article>`).join("")}</div></section>
        <nav class="role-tabs" aria-label="Role views">${(["provider", "sponsor", "operator"] as Role[]).map((item) => `<button class="role-tab ${item === role ? "selected" : ""}" data-role="${item}">${esc(roleSummary(item, graph).title)}</button>`).join("")}</nav>
        <div class="content-grid">
          <section class="case-panel">
            <div class="panel-head"><div><span class="eyebrow">MASTER CASE GRAPH</span><h2>One relationship, every state</h2></div><div class="settlement-state">Settlement ${badge(settlementBadge(graph))}</div></div>
            <div class="timeline">${graph.stages.map((stage, index) => stageCard(stage, index, focus.has(stage.id))).join("")}</div>
          </section>
          <aside class="detail-panel">${detailPanel(selectedStage)}</aside>
        </div>
        <section class="capability-panel"><div class="panel-head"><div><span class="eyebrow">DOMAIN CAPABILITY</span><h2>What Cleara can and cannot do here</h2></div><span class="muted">No wallet connection required</span></div><div class="capability-grid">${graph.capabilities.map((capability) => `<div class="capability"><div class="capability-top"><strong>${esc(capability.name)}</strong>${badge(capability.status)}</div><span>${esc(capability.domain)}</span><p>${esc(capability.detail)}</p></div>`).join("")}</div></section>
      </section>
    </main>`;

  document.querySelectorAll<HTMLButtonElement>("[data-role]").forEach((button) => button.addEventListener("click", () => {
    const nextRole = button.dataset.role;
    if (isRole(nextRole)) { role = nextRole; render(); }
  }));
  document.querySelectorAll<HTMLButtonElement>("[data-stage]").forEach((button) => button.addEventListener("click", () => { selectedStage = graph.stages.find((stage) => stage.id === button.dataset.stage) ?? selectedStage; render(); }));
  document.querySelector<HTMLButtonElement>("#reset")?.addEventListener("click", () => { role = "operator"; selectedStage = graph.stages[0]!; render(); });
}

function stageCard(stage: CaseStage, index: number, focused: boolean): string {
  return `<button class="stage ${focused ? "focused" : ""} ${selectedStage.id === stage.id ? "selected" : ""}" data-stage="${esc(stage.id)}"><span class="stage-index">${String(index + 1).padStart(2, "0")}</span><span class="stage-main"><strong>${esc(stage.label)}</strong><span>${esc(stage.detail)}</span></span><span class="stage-right">${badge(stage.state)}<small>${esc(stage.domain)}</small></span></button>`;
}

function detailPanel(stage: CaseStage): string {
  return `<div class="eyebrow">SELECTED STATE</div><h2>${esc(stage.label)}</h2><div class="detail-state">${badge(stage.state)}<span>${esc(stage.domain)}</span></div><p class="detail-copy">${esc(stage.detail)}</p><div class="read-model-panel"><div class="evidence-title">SLICE B / READ-MODEL AXES</div><div class="read-model-grid"><span>Observation<strong>OBSERVED</strong></span><span>Finality<strong>${stage.evidence.some((item) => item.kind === "testnet") ? "FINALIZED / EVIDENCE" : "UNKNOWN"}</strong></span><span>Evidence<strong>${stage.state === "PENDING_PROOF" ? "PENDING" : stage.evidence.length > 0 ? "REFERENCED" : "NOT_REQUESTED"}</strong></span><span>Canonical read<strong>${stage.domain === "coordination" ? "REFERENCED / CC3" : "NOT_READ"}</strong></span><span>Projection<strong>LOCAL_PROJECTION</strong></span><span>Reconciliation<strong>${stage.id === "reconciliation" ? "RECONCILED" : stage.state === "MISMATCH" ? "MISMATCH" : "PENDING"}</strong></span></div></div><div class="evidence-title">PROVENANCE / EVIDENCE</div><div class="evidence-list">${stage.evidence.map((item) => `<article class="evidence"><div class="evidence-row"><strong>${esc(item.label)}</strong>${badge(item.kind)}</div><p>${esc(item.detail)}</p><small>Boundary: ${esc(evidenceBoundary(item.kind))}</small><small>${esc(item.source)}${item.artifact ? ` · artifact ${item.artifact}` : ""}${item.tx ? ` · tx ${item.tx}` : ""}${item.evidenceId ? ` · evidence ${item.evidenceId}` : ""}</small></article>`).join("")}</div><div class="boundary-note"><strong>Authority boundary</strong><span>This workbench is a read model. It cannot authorize or submit a financial transition.</span></div>`;
}

render();
