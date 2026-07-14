export type IdentityProtocol =
  | 'apple-wallet'
  | 'openid4vp-v1-signed'
  | 'openid4vp-v1-unsigned'
  | 'org-iso-mdoc';

export type ProtocolRequest = {
  protocol: IdentityProtocol;
  data: Record<string, unknown>;
};

export type ProtocolCredential = {
  protocol: IdentityProtocol;
  data: Record<string, unknown>;
};

export type IdentityCapabilities = {
  protocols: IdentityProtocol[];
  origin?: string;
};

export interface IdentityHandler {
  capabilities(): Promise<IdentityCapabilities>;
  present(request: ProtocolRequest): Promise<ProtocolCredential>;
}

export const IDENTITY_PROTOCOLS: Record<IdentityProtocol, true> = {
  'apple-wallet': true,
  'openid4vp-v1-signed': true,
  'openid4vp-v1-unsigned': true,
  'org-iso-mdoc': true,
};

export function isIdentityProtocol(value: unknown): value is IdentityProtocol {
  return typeof value === 'string' && value in IDENTITY_PROTOCOLS;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseProtocolRequest(value: unknown): ProtocolRequest {
  if (!isRecord(value) || !isIdentityProtocol(value.protocol) || !isRecord(value.data)) {
    throw new TypeError('Invalid identity protocol request');
  }
  return { protocol: value.protocol, data: value.data };
}

export function parseProtocolCredential(value: unknown): ProtocolCredential {
  if (!isRecord(value) || !isIdentityProtocol(value.protocol) || !isRecord(value.data)) {
    throw new TypeError('Invalid identity protocol credential');
  }
  return { protocol: value.protocol, data: value.data };
}
