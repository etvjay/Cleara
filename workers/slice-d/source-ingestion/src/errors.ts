export type SourceIngestionErrorCode =
  | "UNSUPPORTED_SCOPE"
  | "WRONG_CHAIN_IDENTITY"
  | "TIMEOUT"
  | "OUTAGE"
  | "RATE_LIMIT"
  | "NOT_FOUND"
  | "MALFORMED_PROVIDER_RESPONSE"
  | "INCONSISTENT_SOURCE_DATA"
  | "INVALID_SOURCE_EVENT"
  | "DUPLICATE_IDENTITY"
  | "CONFLICTING_IDENTITY"
  | "MISSING_TRUSTED_HISTORY"
  | "REORG_DETECTED"
  | "INVALID_BACKFILL_REQUEST"
  | "CURSOR_NOT_ADVANCED"
  | "RETRY_SUBMISSION_FAILED"
  | "UNSAFE_INPUT";

export class SourceIngestionError extends Error {
  public readonly name = "SourceIngestionError";

  public constructor(
    public readonly code: SourceIngestionErrorCode,
    message: string,
    public readonly details: Readonly<Record<string, string | number | null>> = {},
  ) {
    super(`${code}: ${message}`);
  }
}

export function asProviderError(error: unknown, fallbackCode: SourceIngestionErrorCode = "OUTAGE"): SourceIngestionError {
  if (error instanceof SourceIngestionError) return error;
  return new SourceIngestionError(fallbackCode, error instanceof Error ? error.message : "source provider read failed");
}
