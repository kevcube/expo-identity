import {
  validateIdentityRequests,
  type IdentityRequestDefinitions,
} from '../shared/requests';
import { initializeServerCrypto } from './crypto/initialize';
import { createIdentityHandler } from './handler';
import type {
  CallbackServerOutputs,
  DefaultServerOutputs,
  ExpoIdentityOptions,
  ExpoIdentityServer,
} from './types';

export * from '../shared/requests';
export * from '../shared/protocol';
export * from './types';
export { createMemoryTransactionStore } from './transaction-store';

const RESERVED_CLIENT_METADATA: Record<string, true> = {
  jwks: true,
  encrypted_response_enc_values_supported: true,
  encrypted_response_alg_values_supported: true,
  vp_formats_supported: true,
};

function requireNonemptyConfigurationString(value: unknown, path: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${path} must be a nonempty string`);
  }
}

function validateOptions(options: ExpoIdentityOptions<IdentityRequestDefinitions, unknown>): void {
  validateIdentityRequests(options.requests);

  if (
    !options.transactionStore ||
    typeof options.transactionStore.set !== 'function' ||
    typeof options.transactionStore.take !== 'function'
  ) {
    throw new TypeError('transactionStore must implement set() and take()');
  }
  const basePath = options.basePath ?? '/api/identity';
  if (!basePath.startsWith('/') || basePath === '/' || basePath.endsWith('/')) {
    throw new TypeError('basePath must start with one slash and have no trailing slash');
  }
  const ttl = options.transactionTTLSeconds ?? 300;
  if (!Number.isInteger(ttl) || ttl <= 0) {
    throw new TypeError('transactionTTLSeconds must be a positive integer');
  }

  if (Array.isArray(options.trustedOrigins)) {
    for (const [index, origin] of options.trustedOrigins.entries()) {
      requireNonemptyConfigurationString(origin, `trustedOrigins[${index}]`);
    }
  } else if (
    options.trustedOrigins !== undefined &&
    typeof options.trustedOrigins !== 'function'
  ) {
    throw new TypeError('trustedOrigins must be an array or async predicate');
  }

  for (const [index, anchors] of (options.trustAnchors ?? []).entries()) {
    if (!Array.isArray(anchors.issuance) || anchors.issuance.length === 0) {
      throw new TypeError(`trustAnchors[${index}].issuance must not be empty`);
    }
    if (!Array.isArray(anchors.status)) {
      throw new TypeError(`trustAnchors[${index}].status must be an array`);
    }
    anchors.issuance.forEach((certificate, certificateIndex) =>
      requireNonemptyConfigurationString(
        certificate,
        `trustAnchors[${index}].issuance[${certificateIndex}]`
      )
    );
    anchors.status.forEach((certificate, certificateIndex) =>
      requireNonemptyConfigurationString(
        certificate,
        `trustAnchors[${index}].status[${certificateIndex}]`
      )
    );
  }

  if (options.apple?.mode === 'production') {
    requireNonemptyConfigurationString(
      options.apple.merchantIdentifier,
      'apple.merchantIdentifier'
    );
    requireNonemptyConfigurationString(options.apple.teamIdentifier, 'apple.teamIdentifier');
    requireNonemptyConfigurationString(
      options.apple.encryptionCertificate,
      'apple.encryptionCertificate'
    );
    requireNonemptyConfigurationString(
      options.apple.encryptionPrivateKey,
      'apple.encryptionPrivateKey'
    );
  }
  const hasAppleRequest = Object.values(options.requests).some(
    (request) => request.document.apple !== undefined
  );
  if (hasAppleRequest && !options.apple) {
    throw new TypeError('apple configuration is required by an Apple identity request');
  }

  const metadata = options.openid4vp?.clientMetadata;
  if (metadata) {
    for (const key of Object.keys(metadata)) {
      if (key in RESERVED_CLIENT_METADATA) {
        throw new TypeError(`openid4vp.clientMetadata.${key} is package-owned`);
      }
    }
  }
  if (options.openid4vp?.requestSigning) {
    if (options.openid4vp.requestSigning.certificateChain.length === 0) {
      throw new TypeError('openid4vp.requestSigning.certificateChain must not be empty');
    }
    options.openid4vp.requestSigning.certificateChain.forEach((certificate, index) =>
      requireNonemptyConfigurationString(
        certificate,
        `openid4vp.requestSigning.certificateChain[${index}]`
      )
    );
    requireNonemptyConfigurationString(
      options.openid4vp.requestSigning.privateKey,
      'openid4vp.requestSigning.privateKey'
    );
  }
  if (options.readerAuthentication) {
    if (options.readerAuthentication.certificateChain.length === 0) {
      throw new TypeError('readerAuthentication.certificateChain must not be empty');
    }
    options.readerAuthentication.certificateChain.forEach((certificate, index) =>
      requireNonemptyConfigurationString(
        certificate,
        `readerAuthentication.certificateChain[${index}]`
      )
    );
    requireNonemptyConfigurationString(
      options.readerAuthentication.privateKey,
      'readerAuthentication.privateKey'
    );
  }
}

export function expoIdentity<
  const TRequests extends IdentityRequestDefinitions,
  TCallbackOutput,
>(
  options: ExpoIdentityOptions<TRequests, TCallbackOutput> & {
    onVerified: NonNullable<ExpoIdentityOptions<TRequests, TCallbackOutput>['onVerified']>;
  }
): ExpoIdentityServer<
  TRequests,
  CallbackServerOutputs<TRequests, TCallbackOutput>
>;
export function expoIdentity<const TRequests extends IdentityRequestDefinitions>(
  options: ExpoIdentityOptions<TRequests>
): ExpoIdentityServer<TRequests, DefaultServerOutputs<TRequests>>;
export function expoIdentity(
  options: ExpoIdentityOptions<IdentityRequestDefinitions, unknown>
): ExpoIdentityServer<IdentityRequestDefinitions, Record<string, unknown>> {
  validateOptions(options);
  const basePath = options.basePath ?? '/api/identity';
  const cryptoPromise = initializeServerCrypto(options);
  const handler = createIdentityHandler({
    basePath,
    options,
    crypto: cryptoPromise,
  });

  return {
    $types: { requests: options.requests, outputs: {} },
    async ready() {
      await cryptoPromise;
    },
    handler,
  };
}
