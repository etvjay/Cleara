function clearaHero(): string {
  return `<main class="landing-page">
    <section class="reference-hero-wrap" id="cleara-hero" aria-label="Cleara hero">
      <div class="reference-hero">
        <img class="reference-hero-media" src="assets/hero-cleara.png" alt="Illustrated hands arranging separated currency fragments" />
        <div class="reference-hero-shade" aria-hidden="true"></div>
        <header class="reference-hero-header">
          <a class="reference-brand" href="#cleara-hero" aria-label="Cleara home">
            <span class="reference-brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
            <span>Cleara</span>
          </a>
          <nav class="reference-nav" aria-label="Primary navigation">
            <a href="#cleara-model">Platform</a>
            <a href="#cleara-coordination">Workflows</a>
            <a href="#cleara-proof">Evidence</a>
            <a class="reference-nav-pill" href="/try">Enter Cleara</a>
          </nav>
          <div class="reference-utilities">
            <button class="reference-menu" type="button" aria-expanded="false" aria-controls="cleara-mobile-menu">Menu</button>
          </div>
        </header>
        <div class="reference-menu-overlay" id="cleara-mobile-menu" hidden>
          <button class="reference-menu-scrim" type="button" data-menu-close aria-label="Close menu"></button>
          <aside class="reference-menu-panel" role="dialog" aria-modal="true" aria-labelledby="cleara-menu-title">
            <div class="reference-menu-head">
              <p id="cleara-menu-title">EXPLORE CLEARA</p>
              <button class="reference-menu-close" type="button" data-menu-close aria-label="Close menu">×</button>
            </div>
            <nav class="reference-menu-links" aria-label="Mobile navigation">
              <a href="#cleara-model">Platform <span aria-hidden="true">↗</span></a>
              <a href="#cleara-coordination">Workflows <span aria-hidden="true">↗</span></a>
              <a href="#cleara-proof">Evidence <span aria-hidden="true">↗</span></a>
              <a class="reference-menu-enter" href="/try">Enter Cleara <span aria-hidden="true">↗</span></a>
            </nav>
          </aside>
        </div>
        <div class="reference-hero-copy">
          <p>A proof-native financial coordination protocol built on Creditcoin and Attestcoin</p>
          <h1><span>Financial relationships,</span><span>coherent across domains.</span></h1>
        </div>
      </div>
    </section>
  </main>`;
}

function coordinationSection(): string {
  return `<section class="coordination-section" id="cleara-coordination" aria-labelledby="coordination-title">
    <div class="coordination-statement">
      <p><strong>Clear first. Move only what remains.</strong> Financial relationships become coherent when execution, evidence, coordination, and reconciliation stay connected.</p>
    </div>
    <div class="coordination-heading">
      <p class="coordination-eyebrow">CLEARA COORDINATES</p>
      <h2 id="coordination-title">From capital to reconciliation</h2>
    </div>
    <div class="coordination-grid">
      <article class="coordination-card coordination-card-capital">
        <div class="coordination-card-art">
          <img src="assets/card-capital.jpg" alt="Illustrated bank, coins, and market chart for capital coordination" />
          <span class="coordination-art-index">01</span>
        </div>
        <p class="coordination-card-copy">Commit where capital lives, with the source action and its recognition kept distinct.</p>
        <a class="coordination-pill" href="#cleara-coordination"><span class="coordination-pill-dot" aria-hidden="true"></span><span>Capital</span><span aria-hidden="true">↗</span></a>
      </article>
      <article class="coordination-card coordination-card-clearing">
        <div class="coordination-card-art">
          <img src="assets/card-clearing.png" alt="Connected buildings, documents, and growth chart for clearing" />
          <span class="coordination-art-index">02</span>
        </div>
        <p class="coordination-card-copy">Coordinate reciprocal obligations on Creditcoin, then clear before you bridge.</p>
        <a class="coordination-pill" href="#cleara-coordination"><span class="coordination-pill-dot" aria-hidden="true"></span><span>Clearing</span><span aria-hidden="true">↗</span></a>
      </article>
      <article class="coordination-card coordination-card-evidence">
        <div class="coordination-card-art">
          <img src="assets/card-evidence.jpg" alt="Magnifying glass reviewing a financial data table for evidence" />
          <span class="coordination-art-index">03</span>
        </div>
        <p class="coordination-card-copy">Connect native execution, Attestcoin proof, and canonical reconciliation without hiding uncertainty.</p>
        <a class="coordination-pill" href="#cleara-coordination"><span class="coordination-pill-dot" aria-hidden="true"></span><span>Evidence</span><span aria-hidden="true">↗</span></a>
      </article>
    </div>
    <a class="coordination-cta" href="#cleara-coordination">Explore workflows <span aria-hidden="true">→</span></a>
  </section>`;
}

function relationshipPanel(): string {
  return `<section class="relationship-promo-section" id="cleara-relationship" aria-labelledby="relationship-title">
    <div class="relationship-promo">
      <div class="relationship-promo-glow" aria-hidden="true"></div>
      <div class="relationship-promo-copy">
        <h2 id="relationship-title"><span class="relationship-promo-lead">Nomos Kernel</span><span class="relationship-promo-muted">Cleara's financial-semantics and interface boundary</span><span class="relationship-promo-muted">for relationships that span execution domains.</span></h2>
      </div>
      <div class="relationship-promo-visual">
        <img src="assets/card-clearing.png" alt="Illustrated relationship map connecting institutions, documents, and a growth chart" />
      </div>
    </div>
  </section>`;
}

function proofSection(): string {
  return `<section class="proof-section" id="cleara-proof" aria-labelledby="proof-title">
    <div class="proof-heading">
      <p class="proof-eyebrow">FROM ACTION TO RECONCILIATION</p>
      <h2 id="proof-title">A relationship you can read before you move.</h2>
    </div>
    <article class="proof-panel">
      <div class="proof-panel-visual">
        <img src="assets/capital-action.png" alt="Abstract native economic action and capital origin illustration" />
        <div class="proof-panel-overlay" aria-hidden="true">
          <p>FOLLOW THE ORIGIN</p>
          <div><span>SOURCE ACTION</span><b>NATIVE ECONOMIC ACTION</b></div>
          <div><span>CAPITAL</span><b>WHERE IT LIVES</b></div>
          <div><span>COMMITMENT</span><b>KEPT DISTINCT</b></div>
        </div>
      </div>
      <div class="proof-panel-copy">
        <h3>Coordinate capital</h3>
        <p class="proof-lead">Commit where capital lives while keeping its financial relationship intact.</p>
        <p class="proof-support">Connect native action to financeability, facilities, and capital commitments without collapsing their differences.</p>
        <div class="proof-chip-row">
          <span>Capital</span>
          <span>Financeability</span>
          <span>Commitment</span>
        </div>
      </div>
    </article>
    <article class="proof-panel proof-panel-reverse">
      <div class="proof-panel-copy">
        <h3>Verify external action</h3>
        <p class="proof-lead">Attestcoin makes execution outside Cleara independently verifiable.</p>
        <p class="proof-support">Proof establishes what happened. Cleara keeps that fact distinct from the financial meaning it may carry.</p>
        <div class="proof-chip-row">
          <span>Execution</span>
          <span>Proof</span>
          <span>Provenance</span>
        </div>
      </div>
      <div class="proof-panel-visual">
        <img src="assets/proof-evidence.png" alt="Abstract evidence layers showing source action, Attestcoin proof, and a Creditcoin relationship" />
        <div class="proof-panel-overlay" aria-hidden="true">
          <p>READ THE RELATIONSHIP</p>
          <div><span>NATIVE ACTION</span><b>WHAT HAPPENED</b></div>
          <div><span>ATTESTCOIN</span><b>WHAT IS PROVEN</b></div>
          <div><span>CREDITCOIN</span><b>WHAT IS RECOGNIZED</b></div>
        </div>
      </div>
    </article>
    <article class="proof-panel">
      <div class="proof-panel-visual">
        <img src="assets/canonical-relationship.png" alt="Abstract canonical relationship connecting two execution domains" />
        <div class="proof-panel-overlay" aria-hidden="true">
          <p>RECOGNIZE THE RELATIONSHIP</p>
          <div><span>CREDITCOIN</span><b>CANONICAL</b></div>
          <div><span>OBLIGATION</span><b>RECIPROCAL</b></div>
          <div><span>EVIDENCE</span><b>STAYS VISIBLE</b></div>
        </div>
      </div>
      <div class="proof-panel-copy">
        <h3>Normalize financial meaning</h3>
        <p class="proof-lead">Nomos turns verified facts into shared financial semantics.</p>
        <p class="proof-support">External systems can remain native while claims, assets, obligations, and events become legible to Cleara.</p>
        <div class="proof-chip-row">
          <span>Nomos</span>
          <span>Semantics</span>
          <span>Interpretation</span>
        </div>
      </div>
    </article>
    <article class="proof-panel proof-panel-reverse">
      <div class="proof-panel-copy">
        <h3>Coordinate obligations</h3>
        <p class="proof-lead">Creditcoin gives relationships, authority, and obligations a canonical coordination layer.</p>
        <p class="proof-support">Participants can coordinate what is owed without forcing every action or settlement onto one ledger.</p>
        <div class="proof-chip-row">
          <span>Creditcoin</span>
          <span>Authority</span>
          <span>Obligations</span>
        </div>
      </div>
      <div class="proof-panel-visual">
        <img src="assets/clearing-relationship.png" alt="Abstract bilateral clearing relationship connecting two execution domains" />
        <div class="proof-panel-overlay" aria-hidden="true">
          <p>FOLLOW THE CLEARING</p>
          <div><span>DOMAIN A</span><b>RECIPROCAL</b></div>
          <div><span>CREDITCOIN</span><b>RECOGNIZED</b></div>
          <div><span>RESIDUAL</span><b>ONLY WHAT REMAINS</b></div>
        </div>
      </div>
    </article>
    <article class="proof-panel">
      <div class="proof-panel-visual">
        <img src="assets/reconciliation.png" alt="Abstract reconciliation illustration showing evidence and obligation converging on the residual" />
        <div class="proof-panel-overlay" aria-hidden="true">
          <p>CLOSE THE THREAD</p>
          <div><span>EVIDENCE</span><b>AGREED</b></div>
          <div><span>OBLIGATION</span><b>RECONCILED</b></div>
          <div><span>SETTLEMENT</span><b>RESIDUAL ONLY</b></div>
        </div>
      </div>
      <div class="proof-panel-copy">
        <h3>Clear and reconcile</h3>
        <p class="proof-lead">Clear authorized obligations first, then settle and reconcile only what remains.</p>
        <p class="proof-support">Reduce unnecessary movement while preserving the distinction between clearing, settlement, and reconciliation.</p>
        <div class="proof-chip-row">
          <span>Clearing</span>
          <span>Residual</span>
          <span>Reconciliation</span>
        </div>
      </div>
    </article>
  </section>`;
}

function principlesSection(): string {
  return `<section class="principles-section" id="cleara-model" aria-labelledby="model-title">
    <p class="principles-eyebrow" id="model-title">THE CLEARA MODEL</p>
    <div class="principles-carousel" data-principles-carousel>
      <div class="principles-visual">
        <img src="assets/model-visual.png" alt="Abstract illustration of separate execution domains converging through one coherent financial relationship" />
      </div>
      <div class="principles-story" aria-live="polite">
        <p class="principles-kicker"><span data-principles-kicker>THE PROBLEM</span><span data-principles-count>01 / 03</span></p>
        <blockquote class="principles-quote"><strong data-principles-lead>Finance is distributed. Financial state is fragmented.</strong> <span data-principles-rest>Each system may be correct individually while the financial relationship between them remains unresolved.</span></blockquote>
        <div class="principles-note"><strong data-principles-label>THE PROBLEM</strong><span data-principles-note>Many systems. One unresolved relationship.</span></div>
      </div>
      <div class="principles-peek" aria-hidden="true"><small data-principles-peek-label>THE COUNTERPROPOSAL</small><span data-principles-peek>Keep execution native. Share the financial meaning.</span><em data-principles-peek-count>02 / 03</em></div>
    </div>
    <div class="principles-controls" aria-label="Cleara model navigation">
      <button type="button" data-principles-prev aria-label="Previous Cleara model narrative">←</button>
      <button type="button" data-principles-next aria-label="Next Cleara model narrative">→</button>
    </div>
  </section>`;
}

function coordinationCtaSection(): string {
  return `<section class="coordination-cta-section" id="cleara-explore" aria-labelledby="coordination-cta-title">
    <div class="coordination-cta-panel">
      <div class="coordination-cta-copy">
        <h2 id="coordination-cta-title"><span class="coordination-cta-lead">See how Cleara keeps the relationship coherent.</span><span class="coordination-cta-muted">Native execution, verified facts, and canonical coordination for financial relationships that span domains.</span></h2>
        <a class="coordination-cta-action" href="#cleara-model">Explore the model <span aria-hidden="true">→</span></a>
      </div>
      <div class="coordination-cta-visual" aria-hidden="true">
        <img src="assets/coordination-cta.png" alt="" />
      </div>
    </div>
  </section>`;
}

function loopSection(): string {
  return `<section class="loop-section" id="cleara-loop" aria-labelledby="loop-title">
    <div class="loop-grid">
      <div class="loop-copy">
        <p class="loop-eyebrow">THE CLEARA LOOP</p>
        <h2 id="loop-title">What happened. What does it mean. What is now true.</h2>
        <p class="loop-intro">One financial relationship, carried from native execution to reconciliation without forcing every action onto one ledger.</p>
        <p class="loop-path">SOURCE <span>→</span> PROOF <span>→</span> MEANING <span>→</span> CANONICAL STATE <span>→</span> CLEAR <span>→</span> RECONCILE</p>
      </div>
      <div class="loop-list" aria-label="Cleara loop stages">
        <details class="loop-row">
          <summary><span>What happened?</span><span class="loop-row-arrow" aria-hidden="true">⌄</span></summary>
          <p>An economic action occurs in its native execution domain. Cleara does not treat an API response, frontend observation, or submitted transaction as sufficient proof. Attestcoin provides an independently verifiable path from that external action into the financial relationship.</p>
        </details>
        <details class="loop-row">
          <summary><span>What proves it?</span><span class="loop-row-arrow" aria-hidden="true">⌄</span></summary>
          <p>Evidence must be appropriate to the claim being made. Submitted is not included, included is not proven, and proven is not reconciled. Cleara keeps those states distinct until the required external evidence and canonical financial state agree.</p>
        </details>
        <details class="loop-row">
          <summary><span>What does it mean financially?</span><span class="loop-row-arrow" aria-hidden="true">⌄</span></summary>
          <p>An observed transfer or contract event does not explain its financial consequence. Nomos maps verified facts into normalized semantics such as commitment, capitalization, principal, fee, maturity, or obligation. That interpretation remains separate from proof and authority.</p>
        </details>
        <details class="loop-row">
          <summary><span>Who owes what?</span><span class="loop-row-arrow" aria-hidden="true">⌄</span></summary>
          <p>Creditcoin anchors the canonical relationship state once facts have been interpreted. Claims, facilities, commitments, obligations, and provenance remain connected so an obligation can explain why it exists, who it concerns, and what supports it. The graph explains the relationship but is not itself canonical state.</p>
        </details>
        <details class="loop-row">
          <summary><span>Who is authorized?</span><span class="loop-row-arrow" aria-hidden="true">⌄</span></summary>
          <p>Technical ability is not financial authority. Cleara separates wallet, party, role, mandate, and authority grant so it can determine who may commit, encumber, clear, settle, or reconcile. Reciprocity or compatibility alone does not create setoff authority.</p>
        </details>
        <details class="loop-row">
          <summary><span>What can clear?</span><span class="loop-row-arrow" aria-hidden="true">⌄</span></summary>
          <p>Obligations must first be normalized and compared for economic compatibility. Asset representation, maturity, priority, obligation class, beneficiary, terms, and relationship can all matter. Compatible obligations may clear only after the required authority is confirmed.</p>
        </details>
        <details class="loop-row">
          <summary><span>What still needs to move?</span><span class="loop-row-arrow" aria-hidden="true">⌄</span></summary>
          <p>Clearing reduces authorized obligations; it does not settle them. The remaining residual is what still needs native settlement through the appropriate domain. Routed or submitted value is not settled value.</p>
        </details>
        <details class="loop-row">
          <summary><span>Did the relationship reconcile?</span><span class="loop-row-arrow" aria-hidden="true">⌄</span></summary>
          <p>Reconciliation is the closeout of the relationship, not a reporting step added afterward. Cleara compares settlement evidence with canonical financial state and preserves mismatch, stale, reorged, rejected, or replay-required outcomes when they do not agree. Only then can the relationship be treated as reconciled.</p>
        </details>
      </div>
    </div>
  </section>`;
}

function mechanismSection(): string {
  return `<section class="mechanism-section" id="cleara-mechanism" aria-labelledby="mechanism-title">
    <div class="mechanism-panel">
      <div class="mechanism-copy">
        <div>
          <p class="mechanism-eyebrow">THE MECHANISM</p>
          <h2 id="mechanism-title">Clear first.<span>Move only what remains.</span></h2>
          <p class="mechanism-intro">Compatible obligations are coordinated and cleared before anything is routed for settlement. Clearing reduces the amount that must move, while the residual follows its appropriate native settlement path.</p>
        </div>
        <p class="mechanism-boundary"><strong>Clearing is not settlement.</strong> It changes what remains to be settled.</p>
      </div>
      <div class="mechanism-visual" aria-label="Cleara economic mechanism">
        <div class="mechanism-visual-top"><span>THE REDUCTION</span><span>ONE RELATIONSHIP</span></div>
        <div class="mechanism-diagram">
          <div class="mechanism-inputs">
            <div class="mechanism-rail"><span>OBLIGATION A</span><i aria-hidden="true"></i></div>
            <div class="mechanism-rail"><span>OBLIGATION B</span><i aria-hidden="true"></i></div>
          </div>
          <div class="mechanism-core"><small>AUTHORIZED</small><strong>CLEAR</strong></div>
          <div class="mechanism-output"><i aria-hidden="true"></i><span>RESIDUAL</span><b aria-hidden="true">→</b><em>NATIVE SETTLEMENT</em></div>
        </div>
        <ol class="mechanism-steps" aria-label="Cleara mechanism flow">
          <li><small>01</small><span>OBLIGATIONS</span></li>
          <li><small>02</small><span>AUTHORIZED CLEARING</span></li>
          <li><small>03</small><span>RESIDUAL</span></li>
          <li><small>04</small><span>NATIVE SETTLEMENT</span></li>
          <li><small>05</small><span>PROOF</span></li>
          <li><small>06</small><span>RECONCILIATION</span></li>
        </ol>
      </div>
    </div>
  </section>`;
}

function landingFooter(): string {
  return `<footer class="landing-footer" id="cleara-footer" aria-label="Cleara footer">
    <div class="landing-footer-panel">
      <div class="landing-footer-grid">
        <div class="landing-footer-brand">
          <a class="landing-footer-mark" href="#cleara-hero" aria-label="Cleara home">
            <span class="landing-footer-mark-icon" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
            <span>Cleara</span>
          </a>
          <p class="landing-footer-thesis">Financial relationships,<br />coherent across domains.</p>
          <p class="landing-footer-signal"><span aria-hidden="true"></span>Proof-native coordination across execution domains.</p>
        </div>
        <nav class="landing-footer-nav" aria-label="Footer navigation">
          <div class="landing-footer-links">
            <p>EXPLORE</p>
            <a href="#cleara-model">The Cleara Model</a>
            <a href="#cleara-relationship">Nomos Kernel</a>
            <a href="#cleara-loop">The Cleara Loop</a>
            <a href="#cleara-mechanism">The Mechanism</a>
          </div>
          <div class="landing-footer-links">
            <p>SECTIONS</p>
            <a href="#cleara-coordination">Offers</a>
            <a href="#cleara-proof">Proof in context</a>
            <a href="#cleara-hero">Back to top</a>
          </div>
        </nav>
      </div>
      <div class="landing-footer-bottom">
        <p>A proof-native financial coordination protocol built on Creditcoin and Attestcoin.</p>
        <p>Native execution <span>·</span> Verified facts <span>·</span> Canonical coordination</p>
      </div>
    </div>
  </footer>`;
}

export function renderLanding(): string {
  return `${clearaHero()}${coordinationSection()}${relationshipPanel()}${proofSection()}${principlesSection()}${coordinationCtaSection()}${loopSection()}${mechanismSection()}${landingFooter()}`;
}
