import crypto from 'crypto';

import { telemetry } from '../telemetry/Telemetry';
import { asDomainError, DomainError, type DomainErrorCode } from './DomainError';

export type PublicApiError = {
  errorId: string;
  code: DomainErrorCode;
  message: string;
  retryable: boolean;
};

export type ApiErrorResponse = {
  success: false;
  errorMessage: string;
  error: PublicApiError;
};

const generateErrorId = (): string => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const basis = `${Date.now()}|${Math.random()}|${process.pid}`;
  return crypto.createHash('sha1').update(basis).digest('hex');
};

const httpStatusFor = (code: DomainErrorCode): number => {
  switch (code) {
    case 'VALIDATION_ERROR':
      return 400;
    case 'NOT_FOUND':
      return 404;
    case 'CONCURRENCY_LIMIT':
      return 429;
    case 'GRAPH_BACKEND_UNAVAILABLE':
      return 503;
    case 'ANALYSIS_TIMEOUT':
      return 504;
    case 'DATA_INTEGRITY_ERROR':
      return 409;
    case 'UNKNOWN_ERROR':
    default:
      return 500;
  }
};

const publicMessageFor = (err: DomainError): string => {
  // Keep messages user-safe and non-leaky. Details go to telemetry logs only.
  switch (err.code) {
    case 'GRAPH_BACKEND_UNAVAILABLE':
      return 'Graph backend unavailable. Please retry later.';
    case 'ANALYSIS_TIMEOUT':
      return 'Analysis timed out before completion.';
    case 'DATA_INTEGRITY_ERROR':
      return 'Data integrity issue detected. Please run a repository integrity audit.';
    case 'NOT_FOUND':
      return err.message || 'Requested resource not found.';
    case 'VALIDATION_ERROR':
      return err.message || 'Invalid request.';
    case 'CONCURRENCY_LIMIT':
      return err.message || 'Too many concurrent requests.';
    case 'UNKNOWN_ERROR':
    default:
      return 'Unexpected error.';
  }
};

export function mapErrorToApiResponse(err: unknown, context: { operation: string }): {
  status: number;
  body: ApiErrorResponse;
} {
  const errorId = generateErrorId();
  const domain = asDomainError(err);

  telemetry.record({
    name: 'api.error',
    durationMs: 0,
    tags: {
      operation: context.operation,
      code: domain.code,
      errorId,
    },
    metrics: {},
  });

  // Always log a structured line for post-mortem triage.
  // eslint-disable-next-line no-console
  console.error(
    JSON.stringify({
      type: 'ea.error',
      errorId,
      operation: context.operation,
      code: domain.code,
      retryable: domain.retryable,
      message: domain.message,
      details: domain.details,
      // stack is useful internally; still not sent to clients.
      stack: domain.stack,
    }),
  );

  const publicMessage = publicMessageFor(domain);

  return {
    status: httpStatusFor(domain.code),
    body: {
      success: false,
      errorMessage: publicMessage,
      error: {
        errorId,
        code: domain.code,
        message: publicMessage,
        retryable: domain.retryable,
      },
    },
  };
}
