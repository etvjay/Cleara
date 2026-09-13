import { SliceCIntegrationCoordinator } from "../../../slice-c/integration/src/coordinator.js";
import { DurableSnapshotStore, type CheckpointOptions, type CheckpointResult, type PersistedSnapshotRecord, type SerializedSliceBSnapshot } from "../../../slice-c/durable-storage/src/index.js";
import { RetryOrchestrator, type DeliveryResult, type ExecutionResult, type ReadOnlyProvider } from "../../../slice-c/retry-orchestration/src/index.js";
import type { SourceScopeManifest } from "../../source-scope/src/manifest.js";
import { parseSourceScopeManifest, serializeSourceScopeManifest } from "../../source-scope/src/manifest.js";
import { loadCanonicalD0Manifest } from "./canonical-manifest.js";
import { SourceIngestionError } from "./errors.js";
import { SliceBSerializedBoundary } from "./slice-b-boundary.js";
import type { RetryRequestWithoutContract, SerializedSliceCBoundary } from "./types.js";

export interface SerializedSliceCBoundaryOptions {
  readonly scopeId: string;
  readonly manifest: SourceScopeManifest;
  readonly store: DurableSnapshotStore;
  readonly retry: RetryOrchestrator;
}

export class SliceCSerializedBoundary implements SerializedSliceCBoundary {
  public readonly retryOrchestrator: RetryOrchestrator;
  private readonly scopeId: string;
  private readonly manifest: SourceScopeManifest;
  private readonly manifestHash: string;
  private readonly store: DurableSnapshotStore;
  private readonly b: SliceBSerializedBoundary;
  private readonly coordinator: SliceCIntegrationCoordinator;

  public constructor(options: SerializedSliceCBoundaryOptions) {
    const suppliedManifest = parseSourceScopeManifest(options.manifest);
    const canonicalManifest = loadCanonicalD0Manifest();
    if (options.scopeId !== suppliedManifest.scopeId || serializeSourceScopeManifest(suppliedManifest).hash !== canonicalManifest.hash) throw new SourceIngestionError("UNSUPPORTED_SCOPE", "serialized C boundary is not bound to the canonical D0 manifest");
    this.scopeId = options.scopeId;
    this.manifest = suppliedManifest;
    this.manifestHash = canonicalManifest.hash;
    this.store = options.store;
    this.retryOrchestrator = options.retry;
    this.b = new SliceBSerializedBoundary(suppliedManifest);
    this.coordinator = new SliceCIntegrationCoordinator({ scopeId: options.scopeId, store: options.store, retry: options.retry });
  }

  public async checkpoint(snapshot: SerializedSliceBSnapshot, options: CheckpointOptions = {}): Promise<CheckpointResult> {
    return this.coordinator.checkpointApi(this.b.read(snapshot), options);
  }

  public async recover(): Promise<PersistedSnapshotRecord | null> {
    const restarted = await this.coordinator.restartReadModel();
    if (restarted === null) return null;
    this.b.read(restarted.record.snapshot);
    return restarted.record;
  }

  public submitRetry(snapshot: SerializedSliceBSnapshot, request: RetryRequestWithoutContract): DeliveryResult {
    return this.coordinator.submitFromApi(this.b.read(snapshot), request);
  }

  public executeRetry(provider: ReadOnlyProvider | null, now = 0): ExecutionResult {
    return this.coordinator.executeNext(provider, now);
  }

  public serializeRetry(): string {
    return this.coordinator.serializeRetry();
  }

  public restartRetry(serialized: string): SerializedSliceCBoundary {
    try {
      const retry = RetryOrchestrator.fromSerialized(serialized);
      for (const job of retry.snapshot().jobs) {
        const source = job.source;
        this.b.read({ hash: source.snapshotHash, body: source.snapshotBody });
        if (source.sourceScopeHash !== this.manifestHash || source.cursorMode !== this.manifest.cursor.mode || source.cursor.chainKey !== this.manifest.chainKey || source.sourceDomain !== this.manifest.sourceDomain || source.chainId !== this.manifest.evmChainId || source.adapterVersion !== this.manifest.adapterVersion || source.observationSchemaVersion !== this.manifest.eventFamily.schemaVersion || source.finalityPolicyVersion !== this.manifest.finalityPolicy.version) {
          throw new SourceIngestionError("UNSUPPORTED_SCOPE", "serialized retry source does not match the canonical D0 manifest");
        }
      }
      return new SliceCSerializedBoundary({ scopeId: this.scopeId, manifest: this.manifest, store: this.store, retry });
    } catch (error) {
      if (error instanceof SourceIngestionError) throw error;
      throw new SourceIngestionError("MALFORMED_PROVIDER_RESPONSE", error instanceof Error ? error.message : "retry snapshot restore failed");
    }
  }

  public read(snapshot: SerializedSliceBSnapshot) {
    return this.b.read(snapshot);
  }
}

export { SliceCSerializedBoundary as SerializedSliceCBoundary };
