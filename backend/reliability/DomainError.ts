export type DomainErrorCode =
  | 'GRAPH_BACKEND_UNAVAILABLE'
  | 'DATA_INTEGRITY_ERROR'
  | 'ANALYSIS_TIMEOUT'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONCURRENCY_LIMIT'
  | 'UNKNOWN_ERROR';

export type DomainErrorDetails = Record<string, unknown>;

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details?: DomainErrorDetails;
  readonly cause?: unknown;
  readonly retryable: boolean;

  constructor(args: {
    code: DomainErrorCode;
    message: string;
    details?: DomainErrorDetails;
    retryable?: boolean;
    cause?: unknown;
  }) {
    super(args.message);
    this.name = 'DomainError';
    this.code = args.code;
    this.details = args.details;
    this.cause = args.cause;
    this.retryable = args.retryable ?? false;
  }
}

export const isDomainError = (err: unknown): err is DomainError =>
  Boolean(err) &&
  typeof err === 'object' &&
  (err as any).name === 'DomainError' &&
  typeof (err as any).code === 'string';

export const asDomainError = (err: unknown): DomainError => {
  if (isDomainError(err)) return err;
  const message = err instanceof Error ? err.message : 'Unexpected error.';
  return new DomainError({
    code: 'UNKNOWN_ERROR',
    message,
    retryable: false,
    cause: err,
  });
};
