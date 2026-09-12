import { createSliceBApi, type SerializedSliceBSnapshot, type SliceBApi } from "../../../multichain-execution/src/api.js";
import { restoreSnapshot } from "../../../multichain-execution/src/slice-b.js";
import {
  DurableSnapshotStore,
  type CheckpointOptions,
  type CheckpointResult,
  type PersistedSnapshotRecord,
} from "../../durable-storage/src/index.js";
import {
  RetryOrchestrator,
  type DeliveryResult,
  type ExecutionResult,
  type ReadOnlyProvider,
  type RetryRequest,
} from "../../retry-orchestration/src/index.js";

export class SliceCIntegrationError extends Error {
  public readonly name = "SliceCIntegrationError";

  public constructor(public readonly code: "INVALID_SNAPSHOT" | "HASH_MISMATCH" | "SCOPE_MISMATCH", message: string) {
    super(message);
  }
}

export interface SliceCIntegrationOptions {
  readonly scopeId: string;
  readonly store: DurableSnapshotStore;
  readonly retry: RetryOrchestrator;
}

export interface RestartedReadModel {
  readonly record: PersistedSnapshotRecord;
  readonly api: SliceBApi;
}

export type RetryRequestWithoutContract = Omit<RetryRequest, "contract">;

/**
 * Local-only coordinator. It accepts only serialized Slice B snapshots at the
 * storage/retry boundary and never mutates Slice B state or grants authority.
 */
export class SliceCIntegrationCoordinator {
  private readonly scopeId: string;
  private readonly store: DurableSnapshotStore;
  private readonly retry: RetryOrchestrator;

  public constructor(options: SliceCIntegrationOptions) {
    this.scopeId = options.scopeId;
    this.store = options.store;
    this.retry = options.retry;
  }

  public async checkpointApi(api: SliceBApi, options: CheckpointOptions = {}): Promise<CheckpointResult> {
    const serialized = this.validatedSerializedSnapshot(api);
    return this.store.checkpoint(this.scopeId, serialized, options);
  }

  public async restartReadModel(): Promise<RestartedReadModel | null> {
    const record = await this.store.recover(this.scopeId);
    if (record === null) return null;
    const api = this.apiFromSerialized(record.snapshot);
    return { record, api };
  }

  public submitFromApi(api: SliceBApi, request: RetryRequestWithoutContract): DeliveryResult {
    const serialized = this.validatedSerializedSnapshot(api);
    return this.retry.submit({ ...request, contract: serialized });
  }

  public executeNext(provider: ReadOnlyProvider | null, now = 0): ExecutionResult {
    return this.retry.executeNext(provider, now);
  }

  public operatorReplay(jobId: string) {
    return this.retry.operatorReplay(jobId);
  }

  public serializeRetry(): string {
    return this.retry.serialize();
  }

  public restartRetry(serialized: string): SliceCIntegrationCoordinator {
    return new SliceCIntegrationCoordinator({
      scopeId: this.scopeId,
      store: this.store,
      retry: RetryOrchestrator.fromSerialized(serialized),
    });
  }

  private validatedSerializedSnapshot(api: SliceBApi): SerializedSliceBSnapshot {
    let serialized: SerializedSliceBSnapshot;
    try {
      serialized = api.serializeSnapshot();
    } catch (error) {
      throw new SliceCIntegrationError("INVALID_SNAPSHOT", error instanceof Error ? error.message : "Slice B serialization failed");
    }
    this.apiFromSerialized(serialized);
    return serialized;
  }

  private apiFromSerialized(serialized: SerializedSliceBSnapshot): SliceBApi {
    try {
      const restored = restoreSnapshot(serialized.body);
      const api = createSliceBApi(restored);
      const roundTrip = api.serializeSnapshot();
      if (roundTrip.hash !== serialized.hash || roundTrip.body !== serialized.body) {
        throw new SliceCIntegrationError("HASH_MISMATCH", "serialized Slice B snapshot changed across strict restore");
      }
      return api;
    } catch (error) {
      if (error instanceof SliceCIntegrationError) throw error;
      throw new SliceCIntegrationError("INVALID_SNAPSHOT", error instanceof Error ? error.message : "Slice B snapshot restore failed");
    }
  }
}
