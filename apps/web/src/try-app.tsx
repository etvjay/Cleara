import "@rainbow-me/rainbowkit/styles.css";

import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { RainbowKitProvider, ConnectButton } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Address, Hash } from "viem";
import { useAccount, useBalance, useBlockNumber, useReadContract, useSwitchChain, useWaitForTransactionReceipt, useWriteContract, WagmiProvider } from "wagmi";
import { seedCase, type CaseGraph, type CaseStage } from "./case.js";
import { TRY_MODES, type TryMode } from "./try-model.js";
import { CAPITAL_COMMITMENT_VAULT_ABI, MOCK_ERC20_ABI, SEPOLIA_EXPLORER, TESTNET_FIXTURE, walletConfig } from "./wallet.js";

const queryClient = new QueryClient();
const graph = seedCase();
const REPLAY_STAGE_IDS = ["claim", "facility", "obligations", "clearing", "residual", "native-settlement", "attestcoin", "reconciliation"];
const LIFECYCLE_STEPS = [
  { id: "role", label: "Role", domain: "Relationship", participant: "Bind the participant role before acting." },
  { id: "capital", label: "Capital commitment", domain: "Ethereum Sepolia", participant: "Submit a source-chain commitment." },
  { id: "proof", label: "Proof", domain: "Attestcoin", participant: "Wait for inclusion and proof acceptance." },
  { id: "canonical", label: "Canonical state", domain: "Creditcoin CC3", participant: "Creditcoin records the accepted meaning." },
  { id: "obligation", label: "Obligation", domain: "Creditcoin CC3", participant: "A finalized obligation becomes inspectable." },
  { id: "clearing", label: "Clearing", domain: "Creditcoin CC3", participant: "Authorized reciprocal obligations are reduced." },
  { id: "residual", label: "Residual", domain: "Creditcoin CC3", participant: "Only what remains is routed for settlement." },
  { id: "settlement", label: "Settlement", domain: "Ethereum Sepolia", participant: "Native settlement is a separate action." },
  { id: "reconciliation", label: "Reconciliation", domain: "Creditcoin CC3", participant: "Evidence and canonical accounting must agree." },
] as const;

type ActionKey = "mint" | "approve" | "commit";
type ConnectRenderProps = {
  account?: { displayName: string };
  chain?: { unsupported?: boolean };
  mounted: boolean;
  openAccountModal: () => void;
  openChainModal: () => void;
  openConnectModal: () => void;
};

function modeFor(id: string | null): TryMode {
  return TRY_MODES.find((mode) => mode.id === id) ?? TRY_MODES.find((mode) => mode.id === "guided") ?? TRY_MODES[0]!;
}

function displayAddress(address: string | undefined): string {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Not connected";
}

function explorerTx(hash: Hash): string {
  return `${SEPOLIA_EXPLORER}/tx/${hash}`;
}

function ConnectWalletButton(): ReactElement {
  return (
    <ConnectButton.Custom>
      {(props: ConnectRenderProps) => {
        const { account, chain, openAccountModal, openChainModal, openConnectModal, mounted } = props;
        if (!mounted) return <span className="try-wallet-loading">Wallet connector</span>;
        if (!account || !chain) {
          return <button className="try-wallet-button" type="button" onClick={openConnectModal}>Connect wallet</button>;
        }
        if (chain.unsupported) {
          return <button className="try-wallet-button try-wallet-button-warn" type="button" onClick={openChainModal}>Switch network</button>;
        }
        return <button className="try-wallet-button" type="button" onClick={openAccountModal}>{account.displayName}</button>;
      }}
    </ConnectButton.Custom>
  );
}

function EnvironmentModes({ activeId, onSelect }: { activeId: string; onSelect: (id: string) => void }): ReactElement {
  const renderGroup = (group: TryMode["group"], label: string, copy: string) => (
    <section className={`try-mode-group try-mode-group-${group.toLowerCase()}`} aria-labelledby={`try-${group.toLowerCase()}-title`}>
      <div className="try-mode-group-head">
        <p id={`try-${group.toLowerCase()}-title`}>{label}</p>
        <span>{copy}</span>
      </div>
      <div className="try-mode-buttons">
        {TRY_MODES.filter((mode) => mode.group === group).map((mode) => (
          <button
            className={`try-mode-button${mode.id === "guided" ? " is-recommended" : ""}${mode.id === activeId ? " is-active" : ""}`}
            type="button"
            data-try-mode={mode.id}
            aria-pressed={mode.id === activeId}
            key={mode.id}
            onClick={() => onSelect(mode.id)}
          >
            {mode.id === "guided" && <span className="try-recommended">RECOMMENDED</span>}
            <span className="try-mode-title">{mode.title}</span>
            <span className="try-mode-summary">{mode.summary}</span>
            <span className="try-mode-meta">{mode.meta}</span>
          </button>
        ))}
      </div>
    </section>
  );

  return (
    <div className="try-mode-environments">
      {renderGroup("UNDERSTAND", "UNDERSTAND", "See how Cleara works before participating.")}
      {renderGroup("PARTICIPATE", "PARTICIPATE", "Step into a real testnet relationship.")}
    </div>
  );
}

function ModeContext({ mode }: { mode: TryMode }): ReactElement {
  return (
    <aside className="try-mode-context" aria-live="polite">
      <div className="try-context-head">
        <p>WHAT THIS INTERFACE GIVES YOU</p>
        <span className="try-context-status">{mode.status}</span>
      </div>
      <h2>{mode.title}</h2>
      <div className="try-detail-grid">
        <div><small>Participant control</small><strong>{mode.control}</strong></div>
        <div><small>Cleara provides</small><strong>{mode.cleara}</strong></div>
        <div><small>Lifecycle view</small><strong>{mode.will}</strong></div>
        <div><small>Boundary</small><strong>{mode.willNot}</strong></div>
        <div><small>Estimated time</small><strong>{mode.time}</strong></div>
      </div>
      <div className="try-context-note">
        {mode.group === "UNDERSTAND" ? "No wallet is requested in this interface. It is an observation surface." : "Wallet connection appears after the role and the testnet action are explicit."}
      </div>
    </aside>
  );
}

function LifecycleStrip({ mode, activeStep }: { mode: TryMode; activeStep: string }): ReactElement {
  const completed = mode.id === "replay";
  return (
    <div className="try-lifecycle" aria-label="Economic lifecycle">
      <div className="try-lifecycle-head">
        <div>
          <p className="try-eyebrow">SHARED RELATIONSHIP MODEL</p>
          <h3>Every interface enters the same lifecycle.</h3>
        </div>
        <span>{completed ? "COMPOSITE FIXTURE" : "PARTICIPANT PATH"}</span>
      </div>
      <div className="try-lifecycle-rail">
        {LIFECYCLE_STEPS.map((step, index) => {
          const isCurrent = step.id === activeStep;
          const isComplete = completed || (mode.id === "live" && index < 3) || (mode.group === "PARTICIPATE" && index === 0 && mode.id === "claim");
          return (
            <div className={`try-lifecycle-step${isCurrent ? " is-current" : ""}${isComplete ? " is-complete" : ""}`} key={step.id}>
              <span className="try-lifecycle-node">{isComplete ? "✓" : String(index + 1).padStart(2, "0")}</span>
              <span className="try-lifecycle-label">{step.label}</span>
              <small>{step.domain}</small>
              {index < LIFECYCLE_STEPS.length - 1 && <span className="try-lifecycle-line" aria-hidden="true" />}
            </div>
          );
        })}
      </div>
      <p className="try-lifecycle-note">{LIFECYCLE_STEPS.find((step) => step.id === activeStep)?.participant ?? "Inspect the relationship without changing it."}</p>
    </div>
  );
}

function ReplayInterface({ graph: caseGraph }: { graph: CaseGraph }): ReactElement {
  const [index, setIndex] = useState(0);
  const stages = REPLAY_STAGE_IDS.map((id) => caseGraph.stages.find((stage) => stage.id === id)).filter((stage): stage is CaseStage => Boolean(stage));
  const stage = stages[index] ?? stages[0]!;
  const evidence = stage.evidence[0];
  return (
    <div className="try-interface-content">
      <div className="try-interface-kicker"><span>OBSERVE / REPLAY</span><strong>READ ONLY · FIXTURE BACKED</strong></div>
      <h3>Walk the relationship from claim to reconciliation.</h3>
      <p className="try-interface-lead">This is a completed composite fixture assembled from separately evidenced testnet milestones. It explains the economic lifecycle without attributing the fixture to a connected participant.</p>
      <div className="try-replay-card">
        <div className="try-replay-progress"><span>{String(index + 1).padStart(2, "0")} / {String(stages.length).padStart(2, "0")}</span><div><i style={{ width: `${((index + 1) / stages.length) * 100}%` }} /></div><strong>{stage.state}</strong></div>
        <div className="try-replay-stage"><div><p>{stage.domain.toUpperCase()}</p><h4>{stage.label}</h4></div><span>{stage.amount ? `${stage.amount} test units` : "No amount shown"}</span></div>
        <p className="try-replay-detail">{stage.detail}</p>
        <div className="try-evidence-line"><span>Evidence boundary</span><strong>{evidence?.kind?.toUpperCase() ?? "NOT AVAILABLE"}</strong><small>{evidence?.detail ?? "No evidence detail available."}</small></div>
        <div className="try-replay-controls"><button type="button" onClick={() => setIndex((value) => Math.max(0, value - 1))} disabled={index === 0}>Previous</button><button type="button" onClick={() => setIndex((value) => Math.min(stages.length - 1, value + 1))} disabled={index === stages.length - 1}>Next transition</button></div>
      </div>
      <p className="try-interface-boundary">Replay proves comprehensibility. It does not submit a source action, connect a wallet, or turn a projection into canonical financial state.</p>
    </div>
  );
}

function LiveInterface(): ReactElement {
  const sourceHead = useBlockNumber({ chainId: TESTNET_FIXTURE.sourceChainId, query: { refetchInterval: 12_000 } });
  const coordinationHead = useBlockNumber({ chainId: 102031, query: { refetchInterval: 12_000 } });
  return (
    <div className="try-interface-content">
      <div className="try-interface-kicker"><span>OBSERVE / LIVE SHOWCASE</span><strong>READ ONLY · LIVE HEADS</strong></div>
      <h3>Watch the testnet without pretending to own a participant role.</h3>
      <p className="try-interface-lead">This surface reads the current source and coordination chain heads. A shared live relationship read model is not connected to this frontend, so no facility or participant status is invented here.</p>
      <div className="try-live-grid">
        <div><span>Ethereum Sepolia</span><strong>{sourceHead.data ? sourceHead.data.toString() : sourceHead.isError ? "UNAVAILABLE" : "READING"}</strong><small>source chain head</small></div>
        <div><span>Creditcoin CC3</span><strong>{coordinationHead.data ? coordinationHead.data.toString() : coordinationHead.isError ? "UNAVAILABLE" : "READING"}</strong><small>coordination chain head</small></div>
        <div><span>Relationship state</span><strong>NOT INDEXED</strong><small>no shared read model attached</small></div>
        <div><span>Wallet action</span><strong>NONE</strong><small>watch mode is read only</small></div>
      </div>
      <div className="try-live-callout"><span>WHAT YOU CAN TEST HERE</span><p>That the configured testnet endpoints are reachable and advancing. To perform an economic action, select Guided Solo, Claim an open role, or Multi-party.</p></div>
      <p className="try-interface-boundary">Live head data is observed infrastructure state. It is not proof that a relationship transition occurred.</p>
    </div>
  );
}

function ParticipantWorkspace({ mode }: { mode: TryMode }): ReactElement {
  const { address, chain, isConnected } = useAccount();
  const { switchChain, isPending: switching } = useSwitchChain();
  const walletAddress = address as Address | undefined;
  const isSepolia = chain?.id === TESTNET_FIXTURE.sourceChainId;
  const gasBalance = useBalance({ address: walletAddress, chainId: TESTNET_FIXTURE.sourceChainId, query: { enabled: Boolean(walletAddress) } });
  const tokenBalance = useReadContract({ address: TESTNET_FIXTURE.token, abi: MOCK_ERC20_ABI, functionName: "balanceOf", args: [walletAddress ?? "0x0000000000000000000000000000000000000000" as Address], chainId: TESTNET_FIXTURE.sourceChainId, query: { enabled: Boolean(walletAddress) } });
  const allowance = useReadContract({ address: TESTNET_FIXTURE.token, abi: MOCK_ERC20_ABI, functionName: "allowance", args: [walletAddress ?? "0x0000000000000000000000000000000000000000" as Address, TESTNET_FIXTURE.vault], chainId: TESTNET_FIXTURE.sourceChainId, query: { enabled: Boolean(walletAddress) } });
  const nonce = useReadContract({ address: TESTNET_FIXTURE.vault, abi: CAPITAL_COMMITMENT_VAULT_ABI, functionName: "nextNonceByProviderAndFacility", args: [walletAddress ?? "0x0000000000000000000000000000000000000000" as Address, TESTNET_FIXTURE.facilityId], chainId: TESTNET_FIXTURE.sourceChainId, query: { enabled: Boolean(walletAddress) } });
  const { writeContract, data: writeHash, isPending: writing, error: writeError } = useWriteContract();
  const [pendingAction, setPendingAction] = useState<ActionKey | null>(null);
  const [submittedHash, setSubmittedHash] = useState<Hash>();
  const [lastAction, setLastAction] = useState<ActionKey | null>(null);
  const [roleBound, setRoleBound] = useState(mode.id === "guided");
  const requiresRoleBinding = mode.id === "claim" || mode.id === "multi";
  const seenHash = useRef<Hash | undefined>(undefined);
  const actionForHash = useRef<ActionKey | null>(null);
  const receipt = useWaitForTransactionReceipt({ chainId: TESTNET_FIXTURE.sourceChainId, hash: submittedHash });

  useEffect(() => {
    setRoleBound(mode.id === "guided");
  }, [mode.id]);

  useEffect(() => {
    if (!writeHash || writeHash === seenHash.current) return;
    seenHash.current = writeHash;
    setSubmittedHash(writeHash);
    actionForHash.current = pendingAction;
    setPendingAction(null);
  }, [pendingAction, writeHash]);

  useEffect(() => {
    if (!receipt.isSuccess || !actionForHash.current) return;
    setLastAction(actionForHash.current);
    void tokenBalance.refetch();
    void allowance.refetch();
    void nonce.refetch();
  }, [allowance, nonce, receipt.isSuccess, tokenBalance]);

  const send = (action: ActionKey, request: Parameters<typeof writeContract>[0]) => {
    setLastAction(null);
    setPendingAction(action);
    try {
      writeContract(request);
    } catch {
      setPendingAction(null);
    }
  };

  const mint = () => {
    if (!walletAddress || !isSepolia) return;
    send("mint", { address: TESTNET_FIXTURE.token, abi: MOCK_ERC20_ABI, functionName: "mint", args: [walletAddress, TESTNET_FIXTURE.amount], chainId: TESTNET_FIXTURE.sourceChainId });
  };
  const approve = () => {
    if (!walletAddress || !isSepolia) return;
    send("approve", { address: TESTNET_FIXTURE.token, abi: MOCK_ERC20_ABI, functionName: "approve", args: [TESTNET_FIXTURE.vault, TESTNET_FIXTURE.amount], chainId: TESTNET_FIXTURE.sourceChainId });
  };
  const commit = () => {
    if (!walletAddress || !isSepolia) return;
    const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 24 * 60 * 60);
    send("commit", { address: TESTNET_FIXTURE.vault, abi: CAPITAL_COMMITMENT_VAULT_ABI, functionName: "commit", args: [TESTNET_FIXTURE.facilityId, TESTNET_FIXTURE.allocationId, TESTNET_FIXTURE.assetClassId, TESTNET_FIXTURE.token, TESTNET_FIXTURE.amount, expiresAt], chainId: TESTNET_FIXTURE.sourceChainId });
  };
  const enoughToken = typeof tokenBalance.data === "bigint" && tokenBalance.data >= TESTNET_FIXTURE.amount;
  const enoughAllowance = typeof allowance.data === "bigint" && allowance.data >= TESTNET_FIXTURE.amount;
  const actionError = writeError?.message;
  const connectionState = !isConnected ? "CONNECT WALLET" : !isSepolia ? "SWITCH NETWORK" : "READY";
  const tokenReadState = !isConnected ? "NOT CONNECTED" : !isSepolia ? "SWITCH NETWORK" : tokenBalance.isLoading ? "READING" : tokenBalance.data !== undefined ? `${tokenBalance.data.toString()} raw units` : "UNAVAILABLE";
  const allowanceReadState = !isConnected ? "NOT CONNECTED" : !isSepolia ? "SWITCH NETWORK" : allowance.isLoading ? "READING" : allowance.data !== undefined ? `${allowance.data.toString()} raw units` : "UNAVAILABLE";
  const nonceReadState = !isConnected ? "NOT CONNECTED" : !isSepolia ? "SWITCH NETWORK" : nonce.isLoading ? "READING" : nonce.data !== undefined ? String(nonce.data) : "UNAVAILABLE";
  const roleState = requiresRoleBinding ? roleBound ? "BOUND FOR THIS SESSION" : "OPEN ROLE" : "PREFILLED ROLE";
  const canAct = isConnected && isSepolia && roleBound;
  const participantRole = mode.id === "multi" ? "Capital Provider · invited role" : mode.id === "claim" ? "Capital Provider · open role" : "Capital Provider";

  return (
    <div className="try-interface-content">
      <div className="try-interface-kicker"><span>PARTICIPANT TESTNET INTERFACE</span><strong>WALLET · {mode.id === "multi" ? "INVITED ROLES" : "ONE REAL ACTION"}</strong></div>
      <div className="try-participant-title"><div><h3>{mode.id === "multi" ? "Coordinate a relationship with invited participants." : mode.id === "claim" ? "Claim the open provider role, then act." : "Take the source action while Cleara supplies the relationship."}</h3><p className="try-interface-lead">{mode.id === "multi" ? "The role roster is visible first. Your wallet can exercise the provider-side source action; shared invite and role persistence remain outside this frontend slice." : "The other parties remain explicitly labelled Cleara Test Participant. Your connected wallet is the only human-controlled actor in this interface."}</p></div><ConnectWalletButton /></div>
      <div className="try-participant-state">
        <div><span>Wallet</span><strong>{isConnected ? displayAddress(address) : "Not connected"}</strong></div>
        <div><span>Network</span><strong>{!isConnected ? "Choose after role" : isSepolia ? "Ethereum Sepolia" : `${chain?.name ?? "Unknown"} · switch required`}</strong></div>
        <div><span>Role boundary</span><strong>{participantRole}</strong></div>
        <div><span>Mock token read</span><strong>{tokenReadState}</strong></div>
      </div>
      {requiresRoleBinding && <div className="try-role-binding">
        <div className="try-role-binding-head"><div><span>ROLE BINDING / {mode.id === "multi" ? "INVITED PARTICIPANT" : "OPEN ROLE"}</span><strong>{participantRole}</strong></div><em>{roleState}</em></div>
        {mode.id === "multi" && <div className="try-party-roster"><div><span>YOU</span><strong>Capital Provider</strong><small>Wallet-controlled role</small></div><div><span>CLEARA TEST PARTICIPANT</span><strong>Sponsor</strong><small>Automated test actor</small></div><div><span>CLEARA TEST PARTICIPANT</span><strong>Counterparty</strong><small>Automated test actor</small></div></div>}
        <p>{roleBound ? "The role intent is recorded in this browser session. It is not presented as a canonical shared binding." : "Understand the role before connecting. The button records a local role intent only; a shared invite/session service is not attached to this frontend."}</p>
        <button type="button" onClick={() => setRoleBound(true)} disabled={!isConnected || !isSepolia || roleBound}>{roleBound ? "Role intent recorded" : !isConnected ? "Connect wallet first" : !isSepolia ? "Switch to Sepolia first" : "Bind role intent"}</button>
      </div>}
      {isConnected && !isSepolia && <div className="try-network-warning"><strong>Switch to Ethereum Sepolia before writing.</strong><button type="button" onClick={() => switchChain({ chainId: TESTNET_FIXTURE.sourceChainId })} disabled={switching}>{switching ? "Switching..." : "Switch network"}</button></div>}
      <div className="try-action-ladder">
        <ActionRow number="01" title="Prepare test units" detail="Mint the open test-only Mock USD token to the connected wallet. This has no production value." state={lastAction === "mint" ? "CONFIRMED" : !isConnected || !isSepolia ? connectionState : requiresRoleBinding && !roleBound ? "BIND ROLE FIRST" : enoughToken ? "READY" : "USER ACTION"} buttonLabel="Mint 400,000 test units" onClick={mint} disabled={!canAct || writing || receipt.isLoading || enoughToken} action={pendingAction === "mint" ? "WAITING" : undefined} />
        <ActionRow number="02" title="Authorize the vault" detail="Approve the evidence fixture vault to move only the configured test amount." state={lastAction === "approve" ? "CONFIRMED" : !isConnected || !isSepolia ? connectionState : requiresRoleBinding && !roleBound ? "BIND ROLE FIRST" : !enoughToken ? "MINT FIRST" : enoughAllowance ? "READY" : "USER ACTION"} buttonLabel="Approve vault" onClick={approve} disabled={!canAct || !enoughToken || writing || receipt.isLoading || enoughAllowance} action={pendingAction === "approve" ? "WAITING" : undefined} />
        <ActionRow number="03" title="Commit source capital" detail="Submit a source capital commitment on Ethereum Sepolia. This is the browser's real economic action." state={lastAction === "commit" ? "SUBMITTED" : !isConnected || !isSepolia ? connectionState : requiresRoleBinding && !roleBound ? "BIND ROLE FIRST" : !enoughToken ? "MINT FIRST" : !enoughAllowance ? "APPROVE FIRST" : "READY"} buttonLabel="Commit test capital" onClick={commit} disabled={!canAct || !enoughAllowance || writing || receipt.isLoading} action={pendingAction === "commit" ? "WAITING" : undefined} />
      </div>
      <div className="try-participant-receipt">
        <div><span>Live gas balance</span><strong>{!isConnected ? "NOT CONNECTED" : !isSepolia ? "SWITCH NETWORK" : gasBalance.data ? `${gasBalance.data.formatted} ${gasBalance.data.symbol}` : gasBalance.isLoading ? "READING" : "UNAVAILABLE"}</strong></div>
        <div><span>Vault allowance</span><strong>{allowanceReadState}</strong></div>
        <div><span>Next provider nonce</span><strong>{nonceReadState}</strong></div>
      </div>
      <div className="try-receipt-state">
        <div><span>Source receipt</span><strong>{submittedHash ? receipt.isSuccess ? "CONFIRMED" : "PENDING" : "NOT SUBMITTED"}</strong></div>
        <div><span>Attestcoin proof</span><strong>{submittedHash ? "NOT REQUESTED" : "NOT STARTED"}</strong></div>
        <div><span>Creditcoin state</span><strong>{submittedHash ? "NOT UPDATED" : "NOT STARTED"}</strong></div>
      </div>
      {(actionError || receipt.isError) && <p className="try-action-error">The testnet action did not complete: {actionError ?? receipt.error?.message ?? "receipt unavailable"}</p>}
      {submittedHash && <p className="try-action-success"><span>Source transaction</span> <a href={explorerTx(submittedHash)} target="_blank" rel="noreferrer">{displayAddress(submittedHash)}</a> {receipt.isSuccess ? "confirmed" : "awaiting receipt"}</p>}
      <div className="try-interface-boundary"><strong>What happens next:</strong> this page does not fabricate Attestcoin proof, Creditcoin acceptance, obligation formation, clearing, settlement, or reconciliation. The submitted source receipt remains a testnet observation until those separate gates are verified.</div>
    </div>
  );
}

function ActionRow({ number, title, detail, state, buttonLabel, onClick, disabled, action }: { number: string; title: string; detail: string; state: string; buttonLabel: string; onClick: () => void; disabled: boolean; action?: string | undefined }): ReactElement {
  return (
    <div className="try-action-row">
      <span className="try-action-number">{number}</span>
      <div className="try-action-copy"><div><h4>{title}</h4><strong>{state}</strong></div><p>{detail}</p></div>
      <button type="button" onClick={onClick} disabled={disabled}>{action ?? buttonLabel}</button>
    </div>
  );
}

function InterfacePanel({ mode }: { mode: TryMode }): ReactElement {
  if (mode.id === "replay") return <ReplayInterface graph={graph} />;
  if (mode.id === "live") return <LiveInterface />;
  return <ParticipantWorkspace mode={mode} />;
}

function TryApp(): ReactElement {
  const requested = new URLSearchParams(window.location.search).get("mode");
  const [modeId, setModeId] = useState(() => modeFor(requested).id);
  const mode = useMemo(() => modeFor(modeId), [modeId]);
  useEffect(() => {
    window.history.replaceState({}, "", `/try?mode=${encodeURIComponent(mode.id)}`);
  }, [mode.id]);
  const activeStep = mode.id === "replay" ? "reconciliation" : mode.id === "live" ? "proof" : mode.id === "claim" ? "role" : mode.id === "multi" ? "role" : "capital";
  return (
    <main className="try-page try-page-demo">
      <header className="try-header">
        <a className="try-brand" href="/" aria-label="Back to Cleara landing"><span className="try-brand-mark" aria-hidden="true"><i /><i /><i /><i /></span><span>Cleara</span></a>
        <div className="try-header-context"><span className="try-testnet-dot" aria-hidden="true" /><span>TESTNET DEMO</span><a href="/">Back to landing <span aria-hidden="true">↗</span></a></div>
      </header>
      <section className="try-intro" aria-labelledby="try-title">
        <p className="try-eyebrow">ENTER CLEARA / PARTICIPANT TESTING</p>
        <h1 id="try-title">Choose how you'll enter the relationship.</h1>
        <p>Replay the lifecycle, watch the configured testnet heads, or connect a wallet and perform one real participant action.</p>
      </section>
      <section className="try-context-strip" aria-label="Configured testnet context"><span>Source domain <strong>Ethereum Sepolia · 11155111</strong></span><span>Coordination <strong>Creditcoin CC3 · 102031</strong></span><span>Evidence <strong>Attestcoin · chainKey 1</strong></span></section>
      <section className="try-lobby" aria-label="Cleara demo interfaces"><EnvironmentModes activeId={mode.id} onSelect={setModeId} /><ModeContext mode={mode} /></section>
      <section className="try-demo-interface" aria-labelledby="try-interface-title">
        <div className="try-demo-interface-head"><div><p className="try-eyebrow">INTERFACE / {mode.group}</p><h2 id="try-interface-title">{mode.title}</h2></div><span className="try-demo-label">{mode.group === "UNDERSTAND" ? "OBSERVATION" : "PARTICIPANT ACTION"}</span></div>
        <LifecycleStrip mode={mode} activeStep={activeStep} />
        <InterfacePanel mode={mode} />
      </section>
      <p className="try-footer-note">Testnet actions are user initiated, receipt-bound, and visibly separated from proof, canonical coordination, settlement, and reconciliation.</p>
    </main>
  );
}

export function mountTryApp(node: HTMLElement): void {
  createRoot(node).render(<WagmiProvider config={walletConfig}><QueryClientProvider client={queryClient}><RainbowKitProvider><TryApp /></RainbowKitProvider></QueryClientProvider></WagmiProvider>);
}
