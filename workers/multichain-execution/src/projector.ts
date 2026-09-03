import type {
  AllocationProjection,
  AllocationStatus,
  CommitmentProjection,
  Consistency,
  CoordinationCommitmentStatus,
  EvidenceProjection,
  EventPointer,
  FacilityProjection,
  IndexedEvent,
  ProjectionState,
  ProofCoordinates,
  SourceCommitmentStatus,
} from "./model.js";

export interface ApplyEventOptions {
  /** Unknown event names are ignored by default so new contract events are forward compatible. */
  strict?: boolean;
}

export class ProjectionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ProjectionError";
    this.code = code;
  }
}

export function createProjectionState(): ProjectionState {
  return {
    version: 1,
    appliedEventIds: new Set(),
    blocks: new Map(),
    commitments: new Map(),
    allocations: new Map(),
    facilities: new Map(),
    evidence: new Map(),
    lastObservedAt: 0,
  };
}

/**
 * Apply one observed contract event to a read-only projection.
 *
 * This function deliberately has no RPC, signer, or transaction side effect. It
 * only folds observed events into a deterministic state and surfaces block-hash
 * changes as reorgs instead of silently rewriting financial history.
 */
export function applyEvent(
  state: ProjectionState,
  event: IndexedEvent,
  options: ApplyEventOptions = {},
): ProjectionState {
  validateEventEnvelope(event);

  const next = cloneState(state);
  const id = eventId(event);
  const blockKey = `${event.chain}:${event.blockNumber.toString()}`;
  const blockHash = normalise(event.blockHash);
  const priorBlockHash = next.blocks.get(blockKey);
  if (priorBlockHash !== undefined && priorBlockHash !== blockHash) {
    throw new ProjectionError(
      "REORG_DETECTED",
      `block ${blockKey} changed from ${priorBlockHash} to ${blockHash}`,
    );
  }
  next.blocks.set(blockKey, blockHash);

  // A finalized copy may arrive after an unfinalized copy. The event identity
  // is the same, so folding it twice would double-count terminal amounts.
  if (next.appliedEventIds.has(id)) {
    upgradeFinality(next, id, event.finality);
    next.lastObservedAt = Math.max(next.lastObservedAt, event.observedAt);
    return next;
  }
  next.appliedEventIds.add(id);
  next.lastObservedAt = Math.max(next.lastObservedAt, event.observedAt);

  switch (event.name) {
    case "CapitalCommitted":
      requireChain(event, "source");
      applyCapitalCommitted(next, event);
      break;
    case "CapitalConsumed":
      requireChain(event, "source");
      applyCapitalTerminal(next, event, "CONSUMED");
      break;
    case "CapitalExpired":
      requireChain(event, "source");
      applyCapitalTerminal(next, event, "EXPIRED");
      break;
    case "CommitmentRegistered":
      requireChain(event, "coordination");
      applyCommitmentRegistered(next, event);
      break;
    case "CommitmentConsumed":
      requireChain(event, "coordination");
      applyCommitmentTerminal(next, event, "CONSUMED");
      break;
    case "CommitmentExpired":
      requireChain(event, "coordination");
      applyCommitmentTerminal(next, event, "EXPIRED");
      break;
    case "CommitmentLifecycleAccepted":
      requireChain(event, "coordination");
      applyLifecycleAccepted(next, event);
      break;
    case "AllocationProposed":
      requireChain(event, "coordination");
      applyAllocationProposed(next, event);
      break;
    case "AllocationStatusChanged":
      requireChain(event, "coordination");
      applyAllocationStatusChanged(next, event);
      break;
    case "FacilityCreated":
      requireChain(event, "coordination");
      applyFacilityCreated(next, event);
      break;
    case "FacilityStatusChanged":
      requireChain(event, "coordination");
      applyFacilityStatusChanged(next, event);
      break;
    case "CommittedAmountChanged":
      requireChain(event, "coordination");
      applyCommittedAmountChanged(next, event);
      break;
    case "TerminalCommittedAmountChanged":
      requireChain(event, "coordination");
      applyTerminalAmountChanged(next, event);
      break;
    case "CapitalizationSealed":
      requireChain(event, "coordination");
      applyCapitalizationSealed(next, event);
      break;
    case "EvidenceRegistered":
      requireChain(event, "coordination");
      applyEvidenceRegistered(next, event);
      break;
    case "EvidenceConsumed":
      requireChain(event, "coordination");
      applyEvidenceConsumed(next, event);
      break;
    default:
      if (options.strict) {
        throw new ProjectionError("UNKNOWN_EVENT", `unsupported event ${event.name}`);
      }
      break;
  }

  refreshCommitmentConsistency(next);
  return next;
}

export function applyEvents(
  state: ProjectionState,
  events: readonly IndexedEvent[],
  options: ApplyEventOptions = {},
): ProjectionState {
  return events.reduce((current, event) => applyEvent(current, event, options), state);
}

/** The stable identity of an observed log; it is not a proof or financial id. */
export function eventId(event: IndexedEvent): string {
  return [
    event.chain,
    event.chainKey,
    event.blockNumber.toString(),
    normalise(event.blockHash),
    normalise(event.transactionHash),
    event.transactionIndex,
    event.logIndex,
  ].join(":");
}

function cloneState(state: ProjectionState): ProjectionState {
  return {
    version: 1,
    appliedEventIds: new Set(state.appliedEventIds),
    blocks: new Map(state.blocks),
    commitments: new Map([...state.commitments].map(([key, value]) => [key, cloneCommitment(value)])),
    allocations: new Map([...state.allocations].map(([key, value]) => [key, cloneAllocation(value)])),
    facilities: new Map([...state.facilities].map(([key, value]) => [key, cloneFacility(value)])),
    evidence: new Map([...state.evidence].map(([key, value]) => [key, cloneEvidence(value)])),
    lastObservedAt: state.lastObservedAt,
  };
}

function cloneCommitment(value: CommitmentProjection): CommitmentProjection {
  return {
    ...value,
    lifecycleProof: value.lifecycleProof ? { ...value.lifecycleProof } : null,
    sourceEvent: value.sourceEvent ? { ...value.sourceEvent } : null,
    coordinationEvent: value.coordinationEvent ? { ...value.coordinationEvent } : null,
  };
}

function cloneAllocation(value: AllocationProjection): AllocationProjection {
  return { ...value, lastEvent: value.lastEvent ? { ...value.lastEvent } : null };
}

function cloneFacility(value: FacilityProjection): FacilityProjection {
  return { ...value, lastEvent: value.lastEvent ? { ...value.lastEvent } : null };
}

function cloneEvidence(value: EvidenceProjection): EvidenceProjection {
  return {
    ...value,
    registeredEvent: value.registeredEvent ? { ...value.registeredEvent } : null,
    consumedEvent: value.consumedEvent ? { ...value.consumedEvent } : null,
  };
}

function validateEventEnvelope(event: IndexedEvent): void {
  if (!Number.isSafeInteger(event.chainId) || event.chainId <= 0) {
    throw new ProjectionError("INVALID_EVENT", "chainId must be a positive safe integer");
  }
  if (!Number.isSafeInteger(event.chainKey) || event.chainKey < 0) {
    throw new ProjectionError("INVALID_EVENT", "chainKey must be a non-negative safe integer");
  }
  if (event.blockNumber < 0n || event.logIndex < 0 || event.transactionIndex < 0) {
    throw new ProjectionError("INVALID_EVENT", "event coordinates cannot be negative");
  }
  if (!event.blockHash.trim() || !event.transactionHash.trim() || !event.address.trim() || !event.name.trim()) {
    throw new ProjectionError("INVALID_EVENT", "event coordinates and name are required");
  }
  if (!Number.isSafeInteger(event.observedAt) || event.observedAt < 0) {
    throw new ProjectionError("INVALID_EVENT", "observedAt must be a non-negative safe integer");
  }
}

function requireChain(event: IndexedEvent, expected: IndexedEvent["chain"]): void {
  if (event.chain !== expected) {
    throw new ProjectionError("WRONG_CHAIN", `${event.name} must come from the ${expected} chain`);
  }
}

function applyCapitalCommitted(state: ProjectionState, event: IndexedEvent): void {
  const sourceCommitmentId = requiredId(event.args, "sourceCommitmentId", "source commitment id");
  const commitment = resolveCommitment(state, sourceCommitmentId);
  ensureValue(commitment.sourceVault, normalise(event.address), "source vault");
  commitment.sourceCommitmentId = sourceCommitmentId;
  commitment.sourceVault = normalise(event.address);
  commitment.domainId = event.domainId ? normalise(event.domainId) : commitment.domainId;
  commitment.facilityId = optionalId(event.args, "facilityId") ?? commitment.facilityId;
  commitment.allocationId = optionalId(event.args, "allocationId") ?? commitment.allocationId;
  commitment.provider = optionalAddress(event.args, "provider") ?? commitment.provider;
  commitment.assetClassId = optionalId(event.args, "assetClassId") ?? commitment.assetClassId;
  commitment.token = optionalAddress(event.args, "token") ?? commitment.token;
  const amount = optionalBigInt(event.args, "amount");
  ensureValue(commitment.amount, amount, "source amount");
  commitment.amount = amount ?? commitment.amount;
  commitment.expiresAt = optionalBigInt(event.args, "expiresAt") ?? commitment.expiresAt;
  commitment.sourceStatus = "COMMITTED";
  commitment.sourceEvent = pointer(event);
  commitment.updatedAt = event.observedAt;
}

function applyCapitalTerminal(
  state: ProjectionState,
  event: IndexedEvent,
  status: Extract<SourceCommitmentStatus, "CONSUMED" | "EXPIRED">,
): void {
  const sourceCommitmentId = requiredId(event.args, "sourceCommitmentId", "source commitment id");
  const commitment = resolveCommitment(state, sourceCommitmentId);
  ensureValue(commitment.sourceVault, normalise(event.address), "source vault");
  commitment.sourceCommitmentId = sourceCommitmentId;
  commitment.sourceVault = normalise(event.address);
  commitment.domainId = event.domainId ? normalise(event.domainId) : commitment.domainId;
  const amount = optionalBigInt(event.args, "amount");
  ensureValue(commitment.amount, amount, "source amount");
  commitment.amount = amount ?? commitment.amount;
  commitment.actor = optionalAddress(event.args, status === "CONSUMED" ? "recipient" : "provider") ?? commitment.actor;
  commitment.sourceStatus = status;
  commitment.sourceEvent = pointer(event);
  commitment.updatedAt = event.observedAt;
}

function applyCommitmentRegistered(state: ProjectionState, event: IndexedEvent): void {
  const commitmentId = requiredId(event.args, "commitmentId", "commitment id");
  const sourceCommitmentId = requiredId(event.args, "sourceCommitmentId", "source commitment id");
  const commitment = resolveCommitment(state, sourceCommitmentId, commitmentId);
  commitment.commitmentId = commitmentId;
  commitment.sourceCommitmentId = sourceCommitmentId;
  commitment.domainId = event.domainId ? normalise(event.domainId) : commitment.domainId;
  commitment.facilityId = optionalId(event.args, "facilityId") ?? commitment.facilityId;
  commitment.allocationId = optionalId(event.args, "allocationId") ?? commitment.allocationId;
  commitment.provider = optionalAddress(event.args, "provider") ?? commitment.provider;
  commitment.assetClassId = optionalId(event.args, "assetClassId") ?? commitment.assetClassId;
  commitment.token = optionalAddress(event.args, "token") ?? commitment.token;
  const amount = optionalBigInt(event.args, "amount");
  ensureValue(commitment.amount, amount, "commitment amount");
  commitment.amount = amount ?? commitment.amount;
  commitment.expiresAt = optionalBigInt(event.args, "expiresAt") ?? commitment.expiresAt;
  commitment.coordinationStatus = "ACTIVE";
  if (commitment.allocationId) {
    commitment.allocationStatus = state.allocations.get(commitment.allocationId)?.status ?? commitment.allocationStatus;
  }
  commitment.coordinationEvent = pointer(event);
  commitment.updatedAt = event.observedAt;
}

function applyCommitmentTerminal(
  state: ProjectionState,
  event: IndexedEvent,
  status: Extract<CoordinationCommitmentStatus, "CONSUMED" | "EXPIRED">,
): void {
  const commitmentId = requiredId(event.args, "commitmentId", "commitment id");
  const commitment = resolveCommitment(state, "", commitmentId);
  const eventAmount = optionalBigInt(event.args, "amount");
  ensureValue(commitment.amount, eventAmount, "commitment amount");
  commitment.amount = eventAmount ?? commitment.amount;
  commitment.lifecycleEvidenceId = optionalId(event.args, "evidenceId") ?? commitment.lifecycleEvidenceId;
  commitment.actor = optionalAddress(event.args, status === "CONSUMED" ? "recipient" : "provider") ?? commitment.actor;
  commitment.coordinationStatus = status;
  commitment.coordinationEvent = pointer(event);
  commitment.updatedAt = event.observedAt;
  attachLifecycleProof(state, commitment);
}

function applyLifecycleAccepted(state: ProjectionState, event: IndexedEvent): void {
  const commitmentId = requiredId(event.args, "commitmentId", "commitment id");
  const sourceCommitmentId = requiredId(event.args, "sourceCommitmentId", "source commitment id");
  const commitment = resolveCommitment(state, sourceCommitmentId, commitmentId);
  const action = enumNumber(event.args, "action", "lifecycle action");
  const status: CoordinationCommitmentStatus = action === 1 ? "CONSUMED" : action === 2 ? "EXPIRED" : invalidEnum("lifecycle action");
  const amount = requiredBigInt(event.args, "amount", "lifecycle amount");
  ensureValue(commitment.amount, amount, "commitment amount");
  commitment.commitmentId = commitmentId;
  commitment.sourceCommitmentId = sourceCommitmentId;
  commitment.amount = amount;
  commitment.lifecycleEvidenceId = requiredId(event.args, "evidenceId", "lifecycle evidence id");
  commitment.lifecycleQueryId = optionalId(event.args, "queryId") ?? commitment.lifecycleQueryId;
  commitment.actor = optionalAddress(event.args, "actor") ?? commitment.actor;
  commitment.coordinationStatus = status;
  commitment.coordinationEvent = pointer(event);
  commitment.updatedAt = event.observedAt;
  attachLifecycleProof(state, commitment);
}

function applyAllocationProposed(state: ProjectionState, event: IndexedEvent): void {
  const allocationId = requiredId(event.args, "allocationId", "allocation id");
  const allocation = getAllocation(state, allocationId);
  allocation.allocationId = allocationId;
  allocation.facilityId = optionalId(event.args, "facilityId") ?? allocation.facilityId;
  allocation.provider = optionalAddress(event.args, "provider") ?? allocation.provider;
  allocation.amount = optionalBigInt(event.args, "amount") ?? allocation.amount;
  allocation.expiresAt = optionalBigInt(event.args, "expiresAt") ?? allocation.expiresAt;
  allocation.status = "PROPOSED";
  allocation.lastEvent = pointer(event);
  allocation.updatedAt = event.observedAt;
  linkAllocationToCommitments(state, allocation);
}

function applyAllocationStatusChanged(state: ProjectionState, event: IndexedEvent): void {
  const allocationId = requiredId(event.args, "allocationId", "allocation id");
  const allocation = getAllocation(state, allocationId);
  allocation.status = allocationStatus(event.args, "newStatus");
  allocation.lastEvent = pointer(event);
  allocation.updatedAt = event.observedAt;
  linkAllocationToCommitments(state, allocation);
}

function linkAllocationToCommitments(state: ProjectionState, allocation: AllocationProjection): void {
  for (const commitment of state.commitments.values()) {
    if (commitment.allocationId === allocation.allocationId) {
      commitment.allocationStatus = allocation.status;
    }
  }
}

function applyFacilityCreated(state: ProjectionState, event: IndexedEvent): void {
  const facilityId = requiredId(event.args, "facilityId", "facility id");
  const facility = getFacility(state, facilityId);
  facility.facilityId = facilityId;
  facility.status = "PROPOSED";
  facility.lastEvent = pointer(event);
  facility.updatedAt = event.observedAt;
}

function applyFacilityStatusChanged(state: ProjectionState, event: IndexedEvent): void {
  const facilityId = requiredId(event.args, "facilityId", "facility id");
  const facility = getFacility(state, facilityId);
  facility.status = facilityStatus(event.args, "newStatus");
  facility.lastEvent = pointer(event);
  facility.updatedAt = event.observedAt;
}

function applyCommittedAmountChanged(state: ProjectionState, event: IndexedEvent): void {
  const facilityId = requiredId(event.args, "facilityId", "facility id");
  const facility = getFacility(state, facilityId);
  facility.committedAmount = requiredBigInt(event.args, "newAmount", "new committed amount");
  recomputeFacility(facility);
  facility.lastEvent = pointer(event);
  facility.updatedAt = event.observedAt;
}

function applyTerminalAmountChanged(state: ProjectionState, event: IndexedEvent): void {
  const facilityId = requiredId(event.args, "facilityId", "facility id");
  const facility = getFacility(state, facilityId);
  const kind = enumNumber(event.args, "terminalKind", "terminal kind");
  const amount = requiredBigInt(event.args, "newAmount", "new terminal amount");
  if (kind === 1) facility.consumedAmount = amount;
  else if (kind === 2) facility.expiredAmount = amount;
  else invalidEnum("terminal kind");
  recomputeFacility(facility);
  facility.lastEvent = pointer(event);
  facility.updatedAt = event.observedAt;
}

function applyCapitalizationSealed(state: ProjectionState, event: IndexedEvent): void {
  const facilityId = requiredId(event.args, "facilityId", "facility id");
  const facility = getFacility(state, facilityId);
  facility.committedAmount = requiredBigInt(event.args, "committedAmount", "sealed committed amount");
  recomputeFacility(facility);
  facility.lastEvent = pointer(event);
  facility.updatedAt = event.observedAt;
}

function applyEvidenceRegistered(state: ProjectionState, event: IndexedEvent): void {
  const evidenceId = requiredId(event.args, "evidenceId", "evidence id");
  const evidence = getEvidence(state, evidenceId);
  evidence.evidenceId = evidenceId;
  evidence.domainId = optionalId(event.args, "domainId") ?? event.domainId?.toLowerCase() ?? evidence.domainId;
  evidence.chainKey = optionalNumber(event.args, "chainKey") ?? evidence.chainKey;
  evidence.blockHeight = optionalBigInt(event.args, "blockHeight") ?? evidence.blockHeight;
  evidence.txIndex = optionalBigInt(event.args, "txIndex") ?? evidence.txIndex;
  evidence.eventIndex = optionalNumber(event.args, "eventIndex") ?? evidence.eventIndex;
  evidence.encodedTransactionHash = optionalId(event.args, "encodedTransactionHash") ?? evidence.encodedTransactionHash;
  evidence.payloadHash = optionalId(event.args, "payloadHash") ?? evidence.payloadHash;
  evidence.registeredEvent = pointer(event);
  evidence.updatedAt = event.observedAt;
  linkEvidenceToCommitments(state, evidence);
}

function applyEvidenceConsumed(state: ProjectionState, event: IndexedEvent): void {
  const evidenceId = requiredId(event.args, "evidenceId", "evidence id");
  const evidence = getEvidence(state, evidenceId);
  evidence.consumed = true;
  evidence.consumedEvent = pointer(event);
  evidence.updatedAt = event.observedAt;
  linkEvidenceToCommitments(state, evidence);
}

function resolveCommitment(state: ProjectionState, sourceCommitmentId: string, commitmentId?: string): CommitmentProjection {
  const sourceId = sourceCommitmentId ? normalise(sourceCommitmentId) : "";
  const canonicalId = commitmentId ? normalise(commitmentId) : null;
  const sourceKey = sourceId ? findCommitmentKey(state, sourceId) : undefined;
  const canonicalKey = canonicalId ? state.commitments.has(canonicalId) ? canonicalId : undefined : undefined;
  if (sourceKey && canonicalKey && sourceKey !== canonicalKey) {
    const source = state.commitments.get(sourceKey);
    const canonical = state.commitments.get(canonicalKey);
    if (!source || !canonical) throw new ProjectionError("PROJECTION_CORRUPTION", "commitment index is inconsistent");
    const merged = mergeCommitments(source, canonical);
    state.commitments.delete(sourceKey);
    state.commitments.delete(canonicalKey);
    const key = canonicalId ?? sourceKey;
    state.commitments.set(key, merged);
    return merged;
  }
  const key = canonicalKey ?? sourceKey ?? canonicalId ?? sourceId;
  if (!key) throw new ProjectionError("INVALID_EVENT", "commitment identity is required");
  let commitment = state.commitments.get(key);
  if (!commitment) {
    commitment = emptyCommitment(sourceId);
    state.commitments.set(key, commitment);
  }
  if (canonicalId) commitment.commitmentId = canonicalId;
  if (sourceId && commitment.sourceCommitmentId && commitment.sourceCommitmentId !== sourceId) {
    throw new ProjectionError("IDENTITY_MISMATCH", "commitment source id changed");
  }
  if (sourceId) commitment.sourceCommitmentId = sourceId;
  if (canonicalId && key !== canonicalId) {
    state.commitments.delete(key);
    state.commitments.set(canonicalId, commitment);
  }
  return commitment;
}

function findCommitmentKey(state: ProjectionState, sourceCommitmentId: string): string | undefined {
  for (const [key, commitment] of state.commitments) {
    if (commitment.sourceCommitmentId === sourceCommitmentId) return key;
  }
  return undefined;
}

function mergeCommitments(left: CommitmentProjection, right: CommitmentProjection): CommitmentProjection {
  if (
    left.commitmentId &&
    right.commitmentId &&
    left.commitmentId !== right.commitmentId
  ) throw new ProjectionError("IDENTITY_MISMATCH", "two canonical commitment ids share a source id");
  if (
    left.sourceCommitmentId &&
    right.sourceCommitmentId &&
    left.sourceCommitmentId !== right.sourceCommitmentId
  ) throw new ProjectionError("IDENTITY_MISMATCH", "two source commitment ids were merged");
  const merged: CommitmentProjection = {
    ...left,
    ...right,
    commitmentId: right.commitmentId ?? left.commitmentId,
    sourceCommitmentId: right.sourceCommitmentId || left.sourceCommitmentId,
    domainId: right.domainId ?? left.domainId,
    sourceVault: right.sourceVault ?? left.sourceVault,
    facilityId: right.facilityId ?? left.facilityId,
    allocationId: right.allocationId ?? left.allocationId,
    provider: right.provider ?? left.provider,
    assetClassId: right.assetClassId ?? left.assetClassId,
    token: right.token ?? left.token,
    amount: right.amount ?? left.amount,
    expiresAt: right.expiresAt ?? left.expiresAt,
    sourceStatus: right.sourceStatus !== "UNKNOWN" ? right.sourceStatus : left.sourceStatus,
    coordinationStatus: right.coordinationStatus !== "UNKNOWN" ? right.coordinationStatus : left.coordinationStatus,
    allocationStatus: right.allocationStatus !== "UNKNOWN" ? right.allocationStatus : left.allocationStatus,
    actor: right.actor ?? left.actor,
    lifecycleEvidenceId: right.lifecycleEvidenceId ?? left.lifecycleEvidenceId,
    lifecycleQueryId: right.lifecycleQueryId ?? left.lifecycleQueryId,
    lifecycleProof: right.lifecycleProof ?? left.lifecycleProof,
    sourceEvent: right.sourceEvent ?? left.sourceEvent,
    coordinationEvent: right.coordinationEvent ?? left.coordinationEvent,
    updatedAt: Math.max(left.updatedAt, right.updatedAt),
  };
  return merged;
}

function emptyCommitment(sourceCommitmentId: string): CommitmentProjection {
  return {
    commitmentId: null,
    sourceCommitmentId,
    domainId: null,
    sourceVault: null,
    facilityId: null,
    allocationId: null,
    provider: null,
    assetClassId: null,
    token: null,
    amount: null,
    expiresAt: null,
    sourceStatus: "UNKNOWN",
    coordinationStatus: "UNKNOWN",
    allocationStatus: "UNKNOWN",
    actor: null,
    lifecycleEvidenceId: null,
    lifecycleQueryId: null,
    lifecycleProof: null,
    consistency: "UNKNOWN",
    sourceEvent: null,
    coordinationEvent: null,
    updatedAt: 0,
  };
}

function getAllocation(state: ProjectionState, allocationId: string): AllocationProjection {
  const key = normalise(allocationId);
  let allocation = state.allocations.get(key);
  if (!allocation) {
    allocation = {
      allocationId: key,
      facilityId: null,
      provider: null,
      amount: null,
      expiresAt: null,
      status: "UNKNOWN",
      lastEvent: null,
      updatedAt: 0,
    };
    state.allocations.set(key, allocation);
  }
  return allocation;
}

function getFacility(state: ProjectionState, facilityId: string): FacilityProjection {
  const key = normalise(facilityId);
  let facility = state.facilities.get(key);
  if (!facility) {
    facility = {
      facilityId: key,
      committedAmount: null,
      consumedAmount: 0n,
      expiredAmount: 0n,
      activeCommittedAmount: null,
      status: null,
      lastEvent: null,
      updatedAt: 0,
    };
    state.facilities.set(key, facility);
  }
  return facility;
}

function getEvidence(state: ProjectionState, evidenceId: string): EvidenceProjection {
  const key = normalise(evidenceId);
  let evidence = state.evidence.get(key);
  if (!evidence) {
    evidence = {
      evidenceId: key,
      domainId: null,
      chainKey: null,
      blockHeight: null,
      txIndex: null,
      eventIndex: null,
      encodedTransactionHash: null,
      payloadHash: null,
      consumed: false,
      registeredEvent: null,
      consumedEvent: null,
      updatedAt: 0,
    };
    state.evidence.set(key, evidence);
  }
  return evidence;
}

function linkEvidenceToCommitments(state: ProjectionState, evidence: EvidenceProjection): void {
  for (const commitment of state.commitments.values()) {
    if (commitment.lifecycleEvidenceId !== evidence.evidenceId) continue;
    commitment.lifecycleProof = proofFromEvidence(evidence, commitment.lifecycleQueryId);
    if (commitment.lifecycleProof) commitment.lifecycleProof.evidenceConsumed = evidence.consumed;
  }
}

function attachLifecycleProof(state: ProjectionState, commitment: CommitmentProjection): void {
  if (!commitment.lifecycleEvidenceId) return;
  const evidence = state.evidence.get(commitment.lifecycleEvidenceId);
  if (evidence) {
    commitment.lifecycleProof = proofFromEvidence(evidence, commitment.lifecycleQueryId);
    if (commitment.lifecycleProof) commitment.lifecycleProof.evidenceConsumed = evidence.consumed;
  }
}

function proofFromEvidence(evidence: EvidenceProjection, queryId: string | null): ProofCoordinates | null {
  if (
    evidence.domainId === null ||
    evidence.chainKey === null ||
    evidence.blockHeight === null ||
    evidence.txIndex === null ||
    evidence.eventIndex === null ||
    evidence.encodedTransactionHash === null
  ) return null;
  return {
    evidenceId: evidence.evidenceId,
    domainId: evidence.domainId,
    chainKey: evidence.chainKey,
    blockHeight: evidence.blockHeight,
    txIndex: evidence.txIndex,
    eventIndex: evidence.eventIndex,
    encodedTransactionHash: evidence.encodedTransactionHash,
    payloadHash: evidence.payloadHash,
    queryId,
    evidenceConsumed: evidence.consumed,
  };
}

function refreshCommitmentConsistency(state: ProjectionState): void {
  for (const commitment of state.commitments.values()) {
    commitment.consistency = deriveConsistency(commitment);
  }
}

function deriveConsistency(commitment: CommitmentProjection): Consistency {
  if (commitment.amount !== null && commitment.lifecycleProof !== null) {
    // Evidence is linked to a concrete lifecycle transition; the proof itself
    // is still useful before consumption, so this is not a failure condition.
  }
  if (
    commitment.sourceStatus !== "UNKNOWN" &&
    commitment.coordinationStatus !== "UNKNOWN" &&
    commitment.amount !== null
  ) {
    // The source and coordination amounts are represented by one field after
    // semantic correlation. A conflicting value is rejected during folding.
  }
  if (commitment.sourceStatus === "CONSUMED" && commitment.coordinationStatus === "CONSUMED") return "CONSISTENT";
  if (commitment.sourceStatus === "EXPIRED" && commitment.coordinationStatus === "EXPIRED") return "CONSISTENT";
  if (
    (commitment.sourceStatus === "CONSUMED" || commitment.sourceStatus === "EXPIRED") &&
    (commitment.coordinationStatus === "UNKNOWN" || commitment.coordinationStatus === "ACTIVE")
  ) return "PENDING_PROOF";
  if (
    (commitment.coordinationStatus === "CONSUMED" || commitment.coordinationStatus === "EXPIRED") &&
    (commitment.sourceStatus === "UNKNOWN" || commitment.sourceStatus === "COMMITTED")
  ) return "PENDING_SOURCE";
  if (
    (commitment.sourceStatus === "CONSUMED" || commitment.sourceStatus === "EXPIRED") &&
    (commitment.coordinationStatus === "CONSUMED" || commitment.coordinationStatus === "EXPIRED")
  ) return "MISMATCH";
  if (commitment.sourceStatus === "COMMITTED" && commitment.coordinationStatus === "ACTIVE") return "CONSISTENT";
  if (commitment.sourceStatus === "COMMITTED" && commitment.coordinationStatus === "UNKNOWN") return "PENDING_PROOF";
  if (commitment.sourceStatus === "UNKNOWN" && commitment.coordinationStatus === "ACTIVE") return "PENDING_SOURCE";
  return "UNKNOWN";
}

function recomputeFacility(facility: FacilityProjection): void {
  if (facility.committedAmount === null) {
    facility.activeCommittedAmount = null;
    return;
  }
  const terminal = facility.consumedAmount + facility.expiredAmount;
  if (terminal > facility.committedAmount) {
    throw new ProjectionError(
      "ACCOUNTING_INVARIANT",
      `facility ${facility.facilityId} terminal amount ${terminal} exceeds gross ${facility.committedAmount}`,
    );
  }
  facility.activeCommittedAmount = facility.committedAmount - terminal;
}

function pointer(event: IndexedEvent): EventPointer {
  return {
    eventId: eventId(event),
    chain: event.chain,
    chainId: event.chainId,
    chainKey: event.chainKey,
    blockNumber: event.blockNumber,
    blockHash: normalise(event.blockHash),
    transactionHash: normalise(event.transactionHash),
    transactionIndex: event.transactionIndex,
    logIndex: event.logIndex,
    address: normalise(event.address),
    name: event.name,
    finality: event.finality,
  };
}

function upgradeFinality(state: ProjectionState, id: string, finality: IndexedEvent["finality"]): void {
  if (finality !== "finalized") return;
  const upgrade = (value: EventPointer | null): EventPointer | null => {
    if (!value || value.eventId !== id || value.finality === "finalized") return value;
    return { ...value, finality: "finalized" };
  };
  for (const commitment of state.commitments.values()) {
    commitment.sourceEvent = upgrade(commitment.sourceEvent);
    commitment.coordinationEvent = upgrade(commitment.coordinationEvent);
  }
  for (const allocation of state.allocations.values()) allocation.lastEvent = upgrade(allocation.lastEvent);
  for (const facility of state.facilities.values()) facility.lastEvent = upgrade(facility.lastEvent);
  for (const evidence of state.evidence.values()) {
    evidence.registeredEvent = upgrade(evidence.registeredEvent);
    evidence.consumedEvent = upgrade(evidence.consumedEvent);
  }
}

function normalise(value: string): string {
  return value.trim().toLowerCase();
}

function readArg(args: Readonly<Record<string, unknown>>, ...names: string[]): unknown {
  for (const name of names) {
    if (args[name] !== undefined) return args[name];
  }
  return undefined;
}

function requiredId(args: Readonly<Record<string, unknown>>, name: string, label: string): string {
  const value = readArg(args, name);
  if (typeof value !== "string" || !value.trim()) throw new ProjectionError("INVALID_EVENT", `${label} is required`);
  return normalise(value);
}

function optionalId(args: Readonly<Record<string, unknown>>, name: string): string | null {
  const value = readArg(args, name);
  return typeof value === "string" && value.trim() ? normalise(value) : null;
}

function optionalAddress(args: Readonly<Record<string, unknown>>, name: string): string | null {
  return optionalId(args, name);
}

function requiredBigInt(args: Readonly<Record<string, unknown>>, name: string, label: string): bigint {
  const value = optionalBigInt(args, name);
  if (value === null) throw new ProjectionError("INVALID_EVENT", `${label} is required`);
  return value;
}

function optionalBigInt(args: Readonly<Record<string, unknown>>, name: string): bigint | null {
  const value = readArg(args, name);
  if (value === undefined || value === null || value === "") return null;
  try {
    if (typeof value === "bigint") return value;
    if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
    if (typeof value === "string" && /^\d+$/.test(value.trim())) return BigInt(value.trim());
  } catch {
    // Fall through to the projection error below.
  }
  throw new ProjectionError("INVALID_EVENT", `${name} must be an unsigned integer`);
}

function optionalNumber(args: Readonly<Record<string, unknown>>, name: string): number | null {
  const value = optionalBigInt(args, name);
  if (value === null) return null;
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new ProjectionError("INVALID_EVENT", `${name} exceeds safe integer range`);
  return Number(value);
}

function enumNumber(args: Readonly<Record<string, unknown>>, name: string, label: string): number {
  const raw = readArg(args, name);
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) return Number(raw);
  if (typeof raw === "number" && Number.isSafeInteger(raw)) return raw;
  if (typeof raw === "bigint" && raw <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(raw);
  throw new ProjectionError("INVALID_EVENT", `${label} is required`);
}

function allocationStatus(args: Readonly<Record<string, unknown>>, name: string): AllocationStatus {
  const raw = readArg(args, name);
  if (typeof raw === "string" && !/^\d+$/.test(raw.trim())) {
    const status = raw.trim().toUpperCase() as AllocationStatus;
    if (["UNKNOWN", "PROPOSED", "ACTIVE", "COMMITTED", "CONSUMED", "EXPIRED", "CANCELLED"].includes(status)) return status;
  }
  const index = enumNumber(args, name, "allocation status");
  const statuses: AllocationStatus[] = ["UNKNOWN", "PROPOSED", "ACTIVE", "COMMITTED", "CONSUMED", "EXPIRED", "CANCELLED"];
  return statuses[index] ?? invalidEnum("allocation status");
}

function facilityStatus(args: Readonly<Record<string, unknown>>, name: string): string {
  const raw = readArg(args, name);
  if (typeof raw === "string" && !/^\d+$/.test(raw.trim()) && raw.trim()) return raw.trim().toUpperCase();
  const statuses = [
    "NONE", "PROPOSED", "VERIFIED", "OPEN", "ALLOCATING", "CAPITALIZING", "CAPITALIZED", "ACTIVE",
    "REPAYING", "CLOSED", "EXPIRED", "CANCELLED", "DISPUTED", "DEFAULTED",
  ];
  const index = enumNumber(args, name, "facility status");
  return statuses[index] ?? invalidEnum("facility status");
}

function invalidEnum<T>(label: string): T {
  throw new ProjectionError("INVALID_EVENT", `unsupported ${label}`);
}

function ensureValue<T>(existing: T | null, incoming: T | null, label: string): void {
  if (existing !== null && incoming !== null && existing !== incoming) {
    throw new ProjectionError("IDENTITY_MISMATCH", `${label} changed in correlated events`);
  }
}
