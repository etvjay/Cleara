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
};

export const TRY_MODE_PATHS = {
  replay: "/try/replay",
  live: "/try/live",
  guided: "/try/solo",
  claim: "/try/claim",
  multi: "/try/multi-party/new",
} as const;

export function tryPathForMode(id: string): string {
  return TRY_MODE_PATHS[id as keyof typeof TRY_MODE_PATHS] ?? "/try";
}

export function tryModeIdForPath(pathname: string): string | null | undefined {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/try") return null;
  const entry = Object.entries(TRY_MODE_PATHS).find(([, route]) => route === path);
  return entry?.[0];
}

export const TRY_MODES: TryMode[] = [
  {
    id: "replay",
    group: "UNDERSTAND",
    title: "Replay a relationship",
    summary: "Walk through a completed Cleara case step by step.",
    meta: "No wallet · Guided · ~2 min",
    status: "NO WALLET · READ ONLY",
    control: "Observation only",
    cleara: "A prepared relationship and its evidence trail",
    will: "Inspect each transition from claim to reconciliation",
    willNot: "Submit a transaction or change protocol state",
    time: "About 2 minutes",
  },
  {
    id: "live",
    group: "UNDERSTAND",
    title: "Watch one live",
    summary: "Follow configured testnet heads without claiming a participant role.",
    meta: "No wallet · Read only",
    status: "NO WALLET · STATE VIEW",
    control: "Observation only",
    cleara: "Current source and coordination chain heads",
    will: "Watch reachable infrastructure state",
    willNot: "Represent your wallet or financial authority",
    time: "Open-ended",
  },
  {
    id: "guided",
    group: "PARTICIPATE",
    title: "Guided solo session",
    summary: "Play one real role while Cleara fills the others.",
    meta: "Wallet required · Interactive · ~5 min",
    status: "WALLET · TEST ACTORS",
    control: "Capital Provider",
    cleara: "Sponsor and counterparty Cleara Test Participants",
    will: "Connect a wallet, commit test capital, and watch proof and coordination",
    willNot: "Require other people or operator access",
    time: "About 5 minutes",
  },
  {
    id: "claim",
    group: "PARTICIPATE",
    title: "Claim an open role",
    summary: "Join an existing relationship that needs a participant.",
    meta: "Wallet required · Interactive",
    status: "WALLET · ONE ROLE",
    control: "The open Capital Provider role",
    cleara: "A seeded role boundary and the source action path",
    will: "Bind a local role intent, then exercise the source action",
    willNot: "Prepare the whole scenario yourself",
    time: "Depends on role",
  },
  {
    id: "multi",
    group: "PARTICIPATE",
    title: "Create a multi-party session",
    summary: "Invite others and coordinate the relationship together.",
    meta: "Wallet required · Collaborative",
    status: "WALLET · INVITED PARTICIPANTS",
    control: "Your chosen role",
    cleara: "A role roster and shared lifecycle boundary",
    will: "Bind a local role intent and coordinate the source action path",
    willNot: "Treat deterministic test actors as independent users",
    time: "Depends on participants",
  },
];
