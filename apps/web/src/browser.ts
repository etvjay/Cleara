import { renderLanding } from "./landing.js";
import { renderTryPage, TRY_MODES } from "./try.js";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("missing #app");

const isTryPage = window.location.pathname.replace(/\/+$/, "") === "/try";
app.innerHTML = isTryPage ? renderTryPage() : renderLanding();

if (isTryPage) {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-try-mode]"));
  const status = document.querySelector<HTMLElement>(".try-context-status");
  const title = document.querySelector<HTMLElement>("[data-try-detail-title]");
  const control = document.querySelector<HTMLElement>("[data-try-detail-control]");
  const cleara = document.querySelector<HTMLElement>("[data-try-detail-cleara]");
  const will = document.querySelector<HTMLElement>("[data-try-detail-will]");
  const wont = document.querySelector<HTMLElement>("[data-try-detail-wont]");
  const time = document.querySelector<HTMLElement>("[data-try-detail-time]");
  const preview = document.querySelector<HTMLElement>("[data-try-preview]");
  const paintTryMode = (mode: (typeof TRY_MODES)[number]) => {
    buttons.forEach((button) => button.classList.toggle("is-active", button.dataset.tryMode === mode.id));
    if (status) status.textContent = mode.status;
    if (title) title.textContent = mode.title;
    if (control) control.textContent = mode.control;
    if (cleara) cleara.textContent = mode.cleara;
    if (will) will.textContent = mode.will;
    if (wont) wont.textContent = mode.willNot;
    if (time) time.textContent = mode.time;
    if (preview) preview.innerHTML = mode.preview.map(([label, value]) => `<div class="try-preview-row"><span>${label}</span><strong>${value}</strong></div>`).join("");
    window.history.replaceState({}, "", `/try?mode=${encodeURIComponent(mode.id)}`);
  };
  const requestedMode = new URLSearchParams(window.location.search).get("mode");
  const initial = TRY_MODES.find((mode) => mode.id === requestedMode) ?? TRY_MODES.find((mode) => mode.id === "guided") ?? TRY_MODES[0];
  buttons.forEach((button) => button.addEventListener("click", () => {
    const mode = TRY_MODES.find((item) => item.id === button.dataset.tryMode);
    if (mode) paintTryMode(mode);
  }));
  if (initial) paintTryMode(initial);
}

const carousel = document.querySelector<HTMLElement>("[data-principles-carousel]");
if (carousel) {
  const lead = carousel.querySelector<HTMLElement>("[data-principles-lead]");
  const rest = carousel.querySelector<HTMLElement>("[data-principles-rest]");
  const label = carousel.querySelector<HTMLElement>("[data-principles-label]");
  const kicker = carousel.querySelector<HTMLElement>("[data-principles-kicker]");
  const note = carousel.querySelector<HTMLElement>("[data-principles-note]");
  const count = carousel.querySelector<HTMLElement>("[data-principles-count]");
  const peek = carousel.querySelector<HTMLElement>("[data-principles-peek]");
  const peekLabel = carousel.querySelector<HTMLElement>("[data-principles-peek-label]");
  const peekCount = carousel.querySelector<HTMLElement>("[data-principles-peek-count]");
  const story = carousel.querySelector<HTMLElement>(".principles-story");
  const previous = document.querySelector<HTMLButtonElement>("[data-principles-prev]");
  const next = document.querySelector<HTMLButtonElement>("[data-principles-next]");
  const slides = [
    {
      lead: "Finance is distributed. Financial state is fragmented.",
      rest: "Each system may be correct individually while the financial relationship between them remains unresolved.",
      label: "THE PROBLEM",
      note: "Many systems. One unresolved relationship.",
    },
    {
      lead: "Keep execution native. Share the financial meaning.",
      rest: "Attestcoin proves what happened. Nomos interprets it. Creditcoin anchors what is canonically true.",
      label: "THE COUNTERPROPOSAL",
      note: "Coordination without forced consolidation.",
    },
    {
      lead: "Clear first. Move only what remains.",
      rest: "Authorized clearing reduces unnecessary movement before residual settlement and reconciliation.",
      label: "THE MECHANISM",
      note: "Separate clearing from settlement.",
    },
  ];
  let active = 0;
  const paint = (index: number, animate = false) => {
    active = (index + slides.length) % slides.length;
    const current = slides[active]!;
    const upcoming = slides[(active + 1) % slides.length]!;
    const update = () => {
      if (lead) lead.textContent = current.lead;
      if (rest) rest.textContent = current.rest;
      if (label) label.textContent = current.label;
      if (kicker) kicker.textContent = current.label;
      if (note) note.textContent = current.note;
      if (count) count.textContent = `${String(active + 1).padStart(2, "0")} / ${String(slides.length).padStart(2, "0")}`;
      if (peek) peek.textContent = upcoming.lead;
      if (peekLabel) peekLabel.textContent = upcoming.label;
      if (peekCount) peekCount.textContent = `${String((active + 1) % slides.length + 1).padStart(2, "0")} / ${String(slides.length).padStart(2, "0")}`;
    };
    if (animate && story) {
      story.classList.add("is-changing");
      window.setTimeout(() => {
        update();
        window.requestAnimationFrame(() => story.classList.remove("is-changing"));
      }, 90);
      return;
    }
    update();
  };
  previous?.addEventListener("click", () => paint(active - 1, true));
  next?.addEventListener("click", () => paint(active + 1, true));
}

const menuButton = document.querySelector<HTMLButtonElement>(".reference-menu");
const menuOverlay = document.querySelector<HTMLElement>("#cleara-mobile-menu");
const menuClose = menuOverlay?.querySelector<HTMLButtonElement>(".reference-menu-close");
if (menuButton && menuOverlay) {
  let closeTimer: number | undefined;
  const setMenuOpen = (open: boolean) => {
    if (closeTimer) window.clearTimeout(closeTimer);
    menuButton.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("menu-open", open);
    if (open) {
      menuOverlay.hidden = false;
      window.requestAnimationFrame(() => menuOverlay.classList.add("is-open"));
      window.setTimeout(() => menuClose?.focus(), 0);
      return;
    }
    menuOverlay.classList.remove("is-open");
    closeTimer = window.setTimeout(() => {
      if (!menuOverlay.classList.contains("is-open")) menuOverlay.hidden = true;
    }, 420);
    menuButton.focus();
  };
  menuButton.addEventListener("click", () => setMenuOpen(true));
  menuOverlay.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest("[data-menu-close]")) setMenuOpen(false);
  });
  menuOverlay.querySelectorAll<HTMLAnchorElement>("a").forEach((link) => link.addEventListener("click", () => setMenuOpen(false)));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menuOverlay.hidden) setMenuOpen(false);
  });
}

const revealTargets = Array.from(document.querySelectorAll<HTMLElement>(".coordination-section, .relationship-promo-section, .proof-section, .principles-section, .coordination-cta-section, .loop-section, .mechanism-section, footer.landing-footer"));
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (revealTargets.length && !prefersReducedMotion && "IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const target = entry.target as HTMLElement;
      target.classList.remove("motion-enter");
      void target.offsetWidth;
      target.classList.add("motion-enter");
      revealObserver.unobserve(target);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
  revealTargets.forEach((target) => {
    target.classList.add("scroll-reveal");
    revealObserver.observe(target);
  });
}
