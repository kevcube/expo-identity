import { isRecord } from '../shared/protocol';

export type IdentityErrorCode =
  | 'UNAVAILABLE'
  | 'CANCELLED'
  | 'REQUEST_IN_PROGRESS'
  | 'INVALID_REQUEST'
  | 'NETWORK_ERROR'
  | 'EXPIRED'
  | 'INVALID_RESPONSE'
  | 'UNTRUSTED_ISSUER'
  | 'VERIFICATION_FAILED'
  | 'SERVER_ERROR';

export type IdentityClientError = {
  code: IdentityErrorCode;
  message: string;
};

export class IdentityClientException extends Error {
  readonly code: IdentityErrorCode;

  constructor(code: IdentityErrorCode, message: string) {
    super(message);
    this.name = 'IdentityClientException';
    this.code = code;
  }
}

const ERROR_CODES: Record<IdentityErrorCode, true> = {
  UNAVAILABLE: true,
  CANCELLED: true,
  REQUEST_IN_PROGRESS: true,
  INVALID_REQUEST: true,
  NETWORK_ERROR: true,
  EXPIRED: true,
  INVALID_RESPONSE: true,
  UNTRUSTED_ISSUER: true,
  VERIFICATION_FAILED: true,
  SERVER_ERROR: true,
};

export function isIdentityErrorCode(value: unknown): value is IdentityErrorCode {
  return typeof value === 'string' && value in ERROR_CODES;
}

export function normalizeIdentityError(
  error: unknown,
  fallbackCode: IdentityErrorCode,
  fallbackMessage: string
): IdentityClientError {
  if (error instanceof IdentityClientException) {
    return { code: error.code, message: error.message };
  }
  if (
    isRecord(error) &&
    isIdentityErrorCode(error.code) &&
    typeof error.message === 'string'
  ) {
    return { code: error.code, message: error.message };
  }
  return { code: fallbackCode, message: fallbackMessage };
}
