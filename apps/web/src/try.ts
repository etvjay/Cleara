export type TryMode = {
  id: string;
  group: "UNDERSTAND" | "PARTICIPATE";
  title: string;
  summary: string;
  meta: string;
  status: string;
  control: string;
  cleara: string;
  will: string;
  willNot: string;
  time: string;
  preview: [string, string][];
};

export const TRY_MODES: TryMode[] = [
  {
    id: "replay",
    group: "UNDERSTAND",
    title: "Replay a relationship",
    summary: "Walk through a completed Cleara case step by step.",
    meta: "No wallet · Guided · ~2 min",
    status: "NO WALLET · READ ONLY",
    control: "No wallet required",
    cleara: "A prepared relationship and its evidence trail",
    will: "Inspect each transition from claim to reconciliation",
    willNot: "Submit a transaction or change protocol state",
    time: "About 2 minutes",
    preview: [["Facility", "CAPITALIZED"], ["Obligations", "FINALIZED"], ["Clearing", "COMPLETE"], ["Evidence", "VERIFIED"]],
  },
  {
    id: "live",
    group: "UNDERSTAND",
    title: "Watch one live",
    summary: "Follow a test relationship as its state changes.",
    meta: "No wallet · Read only",
    status: "NO WALLET · STATE VIEW",
    control: "No wallet required",
    cleara: "A labelled test relationship and its current read model",
    will: "Watch pending proof, waiting actions, and next transitions",
    willNot: "Represent your wallet or financial authority",
    time: "Open-ended",
    preview: [["Facility", "CAPITALIZED"], ["Provider B", "PENDING_PROOF"], ["Settlement", "WAITING"], ["Evidence", "1 PENDING"]],
  },
  {
    id: "guided",
    group: "PARTICIPATE",
    title: "Guided solo session",
    summary: "Play one real role while Cleara fills the others.",
    meta: "Wallet required · Interactive · ~5 min",
    status: "WALLET · TEST ACTORS",
    control: "Capital Provider",
    cleara: "Sponsor and counterparty test participants",
    will: "Connect a wallet, commit test capital, and watch proof and coordination",
    willNot: "Require other people or operator access",
    time: "About 5 minutes",
    preview: [["Facility", "READY"], ["Provider role", "OPEN"], ["Obligation", "WAITING"], ["Evidence", "—"]],
  },
  {
    id: "claim",
    group: "PARTICIPATE",
    title: "Claim an open role",
    summary: "Join an existing relationship that needs a participant.",
    meta: "Wallet required · Interactive",
    status: "WALLET · ONE ROLE",
    control: "The open role",
    cleara: "A seeded relationship with one role marked open",
    will: "Bind your wallet to a role and receive its next work item",
    willNot: "Prepare the whole scenario yourself",
    time: "Depends on role",
    preview: [["Relationship", "READY"], ["Role", "OPEN"], ["Next action", "AVAILABLE"], ["Evidence", "—"]],
  },
  {
    id: "multi",
    group: "PARTICIPATE",
    title: "Create a multi-party session",
    summary: "Invite others and coordinate the relationship together.",
    meta: "Wallet required · Collaborative",
    status: "WALLET · INVITED PARTICIPANTS",
    control: "Your chosen role",
    cleara: "A test relationship, role invitations, and shared coordination state",
    will: "Invite participants and coordinate the relationship together",
    willNot: "Treat deterministic test actors as independent users",
    time: "Depends on participants",
    preview: [["Relationship", "DRAFT"], ["Roles", "INVITE"], ["Obligations", "NOT STARTED"], ["Evidence", "—"]],
  },
];

function modeButton(mode: TryMode): string {
  const recommended = mode.id === "guided" ? " is-recommended" : "";
  return `<button class="try-mode-button${recommended}" type="button" data-try-mode="${mode.id}">
    ${mode.id === "guided" ? '<span class="try-recommended">RECOMMENDED</span>' : ""}
    <span class="try-mode-title">${mode.title}</span>
    <span class="try-mode-summary">${mode.summary}</span>
    <span class="try-mode-meta">${mode.meta}</span>
  </button>`;
}

function modeGroup(group: TryMode["group"], label: string, copy: string): string {
  const groupModes = TRY_MODES.filter((mode) => mode.group === group);
  return `<section class="try-mode-group try-mode-group-${group.toLowerCase()}" aria-labelledby="try-${group.toLowerCase()}-title">
    <div class="try-mode-group-head">
      <p id="try-${group.toLowerCase()}-title">${label}</p>
      <span>${copy}</span>
    </div>
    <div class="try-mode-buttons">${groupModes.map(modeButton).join("")}</div>
  </section>`;
}

function previewRows(mode: TryMode): string {
  return mode.preview.map(([label, value]) => `<div class="try-preview-row"><span>${label}</span><strong>${value}</strong></div>`).join("");
}

export function renderTryPage(): string {
  const guided = TRY_MODES.find((mode) => mode.id === "guided")!;
  return `<main class="try-page">
    <header class="try-header">
      <a class="try-brand" href="/" aria-label="Back to Cleara landing"><span class="try-brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>Cleara</span></a>
      <div class="try-header-context"><span class="try-testnet-dot" aria-hidden="true"></span><span>TESTNET</span><a href="/">Back to landing <span aria-hidden="true">↗</span></a></div>
    </header>
    <section class="try-intro" aria-labelledby="try-title">
      <p class="try-eyebrow">ENTER CLEARA</p>
      <h1 id="try-title">Choose how you'd like to experience a relationship.</h1>
      <p>Explore a relationship, participate in one, or coordinate one with others. Every path enters the same Cleara system.</p>
    </section>
    <section class="try-context-strip" aria-label="Testnet context">
      <span>Source domain <strong>Ethereum Sepolia</strong></span>
      <span>Coordination <strong>Creditcoin CC3</strong></span>
      <span>Evidence <strong>Attestcoin</strong></span>
    </section>
    <section class="try-lobby" aria-label="Cleara participation modes">
      <div class="try-mode-environments">
        ${modeGroup("UNDERSTAND", "UNDERSTAND", "See how Cleara works before participating.")}
        ${modeGroup("PARTICIPATE", "PARTICIPATE", "Step into a real testnet relationship.")}
      </div>
      <aside class="try-mode-context" aria-live="polite">
        <div class="try-context-head"><p>WHAT THIS MODE GIVES YOU</p><span class="try-context-status">${guided.status}</span></div>
        <h2 data-try-detail-title>${guided.title}</h2>
        <div class="try-detail-grid">
          <div><small>You control</small><strong data-try-detail-control>${guided.control}</strong></div>
          <div><small>Cleara provides</small><strong data-try-detail-cleara>${guided.cleara}</strong></div>
          <div><small>You will</small><strong data-try-detail-will>${guided.will}</strong></div>
          <div><small>You won't need</small><strong data-try-detail-wont>${guided.willNot}</strong></div>
          <div><small>Estimated time</small><strong data-try-detail-time>${guided.time}</strong></div>
        </div>
        <div class="try-context-note">Wallet connection happens after the mode and role are understood.</div>
      </aside>
    </section>
    <section class="try-preview" aria-labelledby="try-preview-title">
      <div class="try-preview-head"><div><p class="try-eyebrow">SAMPLE RELATIONSHIP · COMPOSITE_FIXTURE</p><h2 id="try-preview-title">One relationship, different entry points.</h2></div><span class="try-preview-flow">PARTY <b>→</b> FACILITY <b>→</b> OBLIGATION <b>→</b> CLEARING <b>→</b> RESIDUAL <b>→</b> SETTLEMENT</span></div>
      <div class="try-preview-grid" data-try-preview>${previewRows(guided)}</div>
    </section>
    <p class="try-footer-note">The lobby explains the participation boundary first. It does not connect a wallet or imply a live action before you choose a mode.</p>
  </main>`;
}
