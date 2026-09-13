import {
  createSliceBApi,
  type SerializedSliceBSnapshot,
  type SliceBApi,
} from "../../../multichain-execution/src/api.js";
import {
  advanceFinality,
  backfillReplayHeader,
  createSliceBState,
  ingestObservation,
  observeBlockHeader as observeBlockHeaderState,
  replayReorg,
  restoreSnapshot,
  type ObservationEnvelope,
} from "../../../multichain-execution/src/slice-b.js";
import {
  serializeSourceScopeManifest,
  parseSourceScopeManifest,
  type SourceScopeManifest,
} from "../../source-scope/src/manifest.js";
import { loadCanonicalD0Manifest } from "./canonical-manifest.js";
import { SourceIngestionError } from "./errors.js";
import type { SerializedSliceBBoundary, SourceBlockHeader } from "./types.js";

function blockHeaderInput(manifest: SourceScopeManifest, header: SourceBlockHeader) {
  return {
    chainKey: manifest.chainKey,
    chainId: manifest.evmChainId,
    sourceDomain: manifest.sourceDomain,
    blockNumber: BigInt(header.blockNumber),
    blockHash: header.blockHash,
    parentBlockHash: header.parentHash,
    adapterVersion: manifest.adapterVersion,
    payloadSchemaVersion: manifest.eventFamily.schemaVersion,
    observationId: `block-header:${manifest.scopeId}:${header.blockNumber}:${header.blockHash}`,
    observedAt: header.timestamp,
  };
}

export class SliceBSerializedBoundary implements SerializedSliceBBoundary {
  private readonly manifest: SourceScopeManifest;
  private readonly sourceScopeHash: string;

  public constructor(manifest: SourceScopeManifest) {
    const suppliedManifest = parseSourceScopeManifest(manifest);
    if (suppliedManifest.mode !== "FIXTURE_ONLY" && !suppliedManifest.liveDeployment) throw new SourceIngestionError("UNSUPPORTED_SCOPE", "Slice B boundary cannot be configured for unverified LIVE_READ");
    const canonical = loadCanonicalD0Manifest();
    if (serializeSourceScopeManifest(suppliedManifest).hash !== canonical.hash) throw new SourceIngestionError("UNSUPPORTED_SCOPE", "Slice B boundary manifest does not match the canonical D0 manifest");
    this.manifest = suppliedManifest;
    this.sourceScopeHash = canonical.hash;
  }

  public initialize(anchor: SourceBlockHeader): SerializedSliceBSnapshot {
    const state = createSliceBState([{
      chainKey: this.manifest.chainKey,
      chainId: this.manifest.evmChainId,
      sourceDomain: this.manifest.sourceDomain,
      adapterVersion: this.manifest.adapterVersion,
      observationSchemaVersion: this.manifest.eventFamily.schemaVersion,
      finalityPolicyVersion: this.manifest.finalityPolicy.version,
      cursorMode: this.manifest.cursor.mode,
      anchorBlockNumber: BigInt(anchor.blockNumber),
      anchorBlockHash: anchor.blockHash,
      sourceScopeHash: this.sourceScopeHash,
    }]);
    return createSliceBApi(observeBlockHeaderState(state, blockHeaderInput(this.manifest, anchor))).serializeSnapshot();
  }

  public observeBlockHeader(snapshot: SerializedSliceBSnapshot, header: SourceBlockHeader): SerializedSliceBSnapshot {
    const state = this.restore(snapshot);
    return createSliceBApi(observeBlockHeaderState(state, blockHeaderInput(this.manifest, header))).serializeSnapshot();
  }

  public ingest(snapshot: SerializedSliceBSnapshot, observation: ObservationEnvelope): SerializedSliceBSnapshot {
    const state = this.restore(snapshot);
    return createSliceBApi(ingestObservation(state, observation)).serializeSnapshot();
  }

  public advanceFinality(snapshot: SerializedSliceBSnapshot, finalizedBlock: number, observedAt: number): SerializedSliceBSnapshot {
    if (!Number.isSafeInteger(finalizedBlock) || finalizedBlock < 0) throw new SourceIngestionError("UNSAFE_INPUT", "finalized block must be a safe nonnegative integer");
    const state = this.restore(snapshot);
    return createSliceBApi(advanceFinality(state, this.manifest.chainKey, BigInt(finalizedBlock), observedAt)).serializeSnapshot();
  }

  public backfillReplayHeader(snapshot: SerializedSliceBSnapshot, source: ObservationEnvelope): SerializedSliceBSnapshot {
    const state = this.restore(snapshot);
    return createSliceBApi(backfillReplayHeader(state, source)).serializeSnapshot();
  }

  public replay(snapshot: SerializedSliceBSnapshot, replacement: ObservationEnvelope, finalizedBlock: number, observedAt: number): { readonly snapshot: SerializedSliceBSnapshot; readonly outcome: "REPLAYED" | "BLOCKED" | "NOOP" } {
    if (!Number.isSafeInteger(finalizedBlock) || finalizedBlock < 0) throw new SourceIngestionError("UNSAFE_INPUT", "replay finalized block must be a safe nonnegative integer");
    const state = this.restore(snapshot);
    const result = replayReorg(state, replacement, { finalizedBlock: BigInt(finalizedBlock), observedAt });
    return { snapshot: createSliceBApi(result.state).serializeSnapshot(), outcome: result.outcome };
  }

  public read(snapshot: SerializedSliceBSnapshot): SliceBApi {
    return createSliceBApi(this.restore(snapshot));
  }

  private restore(snapshot: SerializedSliceBSnapshot) {
    if (snapshot === null || typeof snapshot !== "object" || typeof snapshot.body !== "string" || typeof snapshot.hash !== "string") throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", "Slice B snapshot envelope is invalid");
    try {
      const state = restoreSnapshot(snapshot.body);
      const sourceScope = state.sourceScopes.get(this.manifest.chainKey);
      if (state.sourceScopes.size !== 1 || !sourceScope || sourceScope.chainKey !== this.manifest.chainKey || sourceScope.chainId !== this.manifest.evmChainId || sourceScope.sourceDomain !== this.manifest.sourceDomain || sourceScope.adapterVersion !== this.manifest.adapterVersion || sourceScope.observationSchemaVersion !== this.manifest.eventFamily.schemaVersion || sourceScope.finalityPolicyVersion !== this.manifest.finalityPolicy.version || sourceScope.cursorMode !== this.manifest.cursor.mode || sourceScope.sourceScopeHash !== this.sourceScopeHash) throw new SourceIngestionError("UNSUPPORTED_SCOPE", "Slice B snapshot source descriptor does not match the canonical D0 manifest");
      const checkpoint = state.checkpoints.get(this.manifest.chainKey);
      if (checkpoint && checkpoint.lastFinalizedBlock !== null && checkpoint.lastFinalizedBlock > checkpoint.lastObservedBlock + BigInt(this.manifest.finalityPolicy.depth)) throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", "Slice B checkpoint finality exceeds the bounded D0 finality window");
      const roundTrip = createSliceBApi(state).serializeSnapshot();
      if (roundTrip.hash !== snapshot.hash || roundTrip.body !== snapshot.body) throw new SourceIngestionError("INCONSISTENT_SOURCE_DATA", "Slice B snapshot changed across strict restore");
      return state;
    } catch (error) {
      if (error instanceof SourceIngestionError) throw error;
      throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", error instanceof Error ? error.message : "Slice B snapshot restore failed");
    }
  }
}
