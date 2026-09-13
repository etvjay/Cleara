import { SourceProviderError, type SourceReadProvider } from "./provider.js";
import type {
  FixtureDataset,
  FixtureFailure,
  FixtureProviderOptions,
  ProviderMethod,
  SourceBlockHeader,
  SourceChainIdentity,
  SourceLog,
  SourceLogFilter,
  SourceTransactionReceipt,
} from "./types.js";
import type { SourceScopeManifest } from "../../source-scope/src/manifest.js";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function validBlock(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validHash(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

export function scopeCheck(scope: SourceScopeManifest, expectedScope: string): void {
  if (scope.mode !== "FIXTURE_ONLY" || scope.scopeId !== expectedScope) throw new SourceProviderError("UNSUPPORTED_SCOPE", "fixture provider does not support this source scope");
}

export class DeterministicFixtureProvider implements SourceReadProvider {
  private readonly dataset: FixtureDataset;
  private readonly options: FixtureProviderOptions;
  private readonly failures: Array<FixtureFailure & { remaining: number }>;
  private readonly blocks = new Map<number, FixtureDataset["blocks"][number]>();
  private readonly receipts = new Map<string, FixtureDataset["receipts"][number]>();

  public constructor(dataset: FixtureDataset, options: FixtureProviderOptions = {}) {
    this.dataset = clone(dataset);
    this.options = options;
    this.failures = (options.failures ?? []).map((failure) => ({ ...failure, remaining: failure.remaining ?? 1 }));
    for (const block of this.dataset.blocks) this.blocks.set(block.blockNumber, block);
    for (const receipt of this.dataset.receipts) this.receipts.set(receipt.transactionHash.toLowerCase(), receipt);
  }

  public async getChainIdentity(scope: SourceScopeManifest): Promise<SourceChainIdentity> {
    scopeCheck(scope, this.dataset.scopeId);
    this.maybeFail("getChainIdentity");
    return clone(this.options.identityOverride ?? this.dataset.identity) as SourceChainIdentity;
  }

  public async getLatestBlockNumber(scope: SourceScopeManifest): Promise<number> {
    scopeCheck(scope, this.dataset.scopeId);
    this.maybeFail("getLatestBlockNumber");
    return clone(this.options.latestBlockNumberOverride ?? this.dataset.latestBlockNumber) as number;
  }

  public async getBlockHeader(scope: SourceScopeManifest, blockNumber: number): Promise<SourceBlockHeader> {
    scopeCheck(scope, this.dataset.scopeId);
    this.maybeFail("getBlockHeader");
    if (!validBlock(blockNumber)) throw new SourceProviderError("MALFORMED_PROVIDER_RESPONSE", "fixture block request must be a safe nonnegative integer");
    if (this.options.blockOverrides && Object.prototype.hasOwnProperty.call(this.options.blockOverrides, String(blockNumber))) {
      return clone(this.options.blockOverrides[String(blockNumber)]) as SourceBlockHeader;
    }
    const block = this.blocks.get(blockNumber);
    if (!block) throw new SourceProviderError("NOT_FOUND", `fixture block ${blockNumber} was not found`);
    return clone(block);
  }

  public async getLogs(scope: SourceScopeManifest, filter: SourceLogFilter): Promise<readonly SourceLog[]> {
    scopeCheck(scope, this.dataset.scopeId);
    this.maybeFail("getLogs");
    if (!validBlock(filter.fromBlock) || !validBlock(filter.toBlock) || filter.fromBlock > filter.toBlock || !validHash(filter.topic0) || !/^0x[0-9a-fA-F]{40}$/.test(filter.address)) {
      throw new SourceProviderError("MALFORMED_PROVIDER_RESPONSE", "fixture log filter is invalid");
    }
    if (this.options.logsOverride !== undefined) return clone(this.options.logsOverride) as readonly SourceLog[];
    return clone(this.dataset.logs.filter((log) => log.blockNumber >= filter.fromBlock && log.blockNumber <= filter.toBlock && log.address.toLowerCase() === filter.address.toLowerCase() && log.topics[0]?.toLowerCase() === filter.topic0.toLowerCase()));
  }

  public async getTransactionReceipt(scope: SourceScopeManifest, transactionHash: string): Promise<SourceTransactionReceipt> {
    scopeCheck(scope, this.dataset.scopeId);
    this.maybeFail("getTransactionReceipt");
    if (!validHash(transactionHash)) throw new SourceProviderError("MALFORMED_PROVIDER_RESPONSE", "fixture transaction hash request is invalid");
    if (this.options.receiptOverrides && Object.prototype.hasOwnProperty.call(this.options.receiptOverrides, transactionHash.toLowerCase())) {
      return clone(this.options.receiptOverrides[transactionHash.toLowerCase()]) as SourceTransactionReceipt;
    }
    const receipt = this.receipts.get(transactionHash.toLowerCase());
    if (!receipt) throw new SourceProviderError("NOT_FOUND", `fixture receipt ${transactionHash} was not found`);
    return clone(receipt);
  }

  private maybeFail(method: ProviderMethod): void {
    const failure = this.failures.find((candidate) => candidate.method === method && (candidate.remaining ?? 1) > 0);
    if (!failure) return;
    failure.remaining = (failure.remaining ?? 1) - 1;
    throw new SourceProviderError(failure.code, failure.reason);
  }
}

export { SourceProviderError } from "./provider.js";
