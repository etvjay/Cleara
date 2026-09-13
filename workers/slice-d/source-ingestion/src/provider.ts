import type { SourceScopeManifest } from "../../source-scope/src/manifest.js";
import { SourceIngestionError, type SourceIngestionErrorCode } from "./errors.js";
import type {
  ProviderMethod,
  SourceBlockHeader,
  SourceChainIdentity,
  SourceLog,
  SourceLogFilter,
  SourceTransactionReceipt,
} from "./types.js";

export type SourceProviderErrorCode = "UNSUPPORTED_SCOPE" | "TIMEOUT" | "OUTAGE" | "RATE_LIMIT" | "NOT_FOUND" | "MALFORMED_PROVIDER_RESPONSE";

export class SourceProviderError extends SourceIngestionError {
  public constructor(code: SourceProviderErrorCode, message: string) {
    super(code, message);
  }
}

export interface SourceReadProvider {
  readonly getChainIdentity: (scope: SourceScopeManifest) => Promise<SourceChainIdentity>;
  readonly getLatestBlockNumber: (scope: SourceScopeManifest) => Promise<number>;
  readonly getBlockHeader: (scope: SourceScopeManifest, blockNumber: number) => Promise<SourceBlockHeader>;
  readonly getLogs: (scope: SourceScopeManifest, filter: SourceLogFilter) => Promise<readonly SourceLog[]>;
  readonly getTransactionReceipt: (scope: SourceScopeManifest, transactionHash: string) => Promise<SourceTransactionReceipt>;
}

export interface ValidatedProviderResponses {
  readonly identity: SourceChainIdentity;
  readonly latestBlockNumber: number;
  readonly block?: SourceBlockHeader;
  readonly logs?: readonly SourceLog[];
  readonly receipt?: SourceTransactionReceipt;
}

export function isProviderErrorCode(code: SourceIngestionErrorCode): code is SourceProviderErrorCode {
  return ["UNSUPPORTED_SCOPE", "TIMEOUT", "OUTAGE", "RATE_LIMIT", "NOT_FOUND", "MALFORMED_PROVIDER_RESPONSE"].includes(code);
}

export function providerMethodName(method: ProviderMethod): string {
  return method;
}
