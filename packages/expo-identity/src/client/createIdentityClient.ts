import type {
  IdentityRequestDefinition,
  IdentityRequestDefinitions,
} from '../shared/requests';
import {
  isRecord,
  parseProtocolRequest,
  type IdentityCapabilities,
  type IdentityHandler,
  type ProtocolCredential,
  type ProtocolRequest,
} from '../shared/protocol';
import defaultHandler from './default-handler';
import {
  isIdentityErrorCode,
  normalizeIdentityError,
  type IdentityClientError,
} from './errors';

export type IdentityServerTypeContract = {
  readonly $types: {
    requests: IdentityRequestDefinitions;
    outputs: Record<string, unknown>;
  };
};

export type RequestKey<TServer> = TServer extends {
  readonly $types: { requests: infer TRequests };
}
  ? Extract<keyof TRequests, string>
  : never;

export type RequestDefinition<
  TServer,
  TKey extends RequestKey<TServer>,
> = TServer extends {
  readonly $types: { requests: infer TRequests };
}
  ? TRequests[TKey & keyof TRequests] extends IdentityRequestDefinition
    ? TRequests[TKey & keyof TRequests]
    : never
  : never;

export type Output<TServer, TKey extends RequestKey<TServer>> = TServer extends {
  readonly $types: { outputs: infer TOutputs };
}
  ? TKey extends keyof TOutputs
    ? TOutputs[TKey]
    : never
  : never;

export type IdentityClientResult<T> =
  | { data: T; error: null }
  | { data: null; error: IdentityClientError };

export type PreparedIdentityRequest<TServer, TKey extends RequestKey<TServer>> = {
  readonly expiresAt: string;
  present(): Promise<IdentityClientResult<Output<TServer, TKey>>>;
};

export type IdentityClientConfig = {
  baseURL?: string;
  basePath?: string;
  fetch?: typeof globalThis.fetch;
  handler?: IdentityHandler;
};

type PreparedResponse = {
  transactionId: string;
  expiresAt: string;
  request: ProtocolRequest;
};

function clientErrorFromResponse(payload: unknown): IdentityClientError {
  if (isRecord(payload) && isRecord(payload.error)) {
    const error = payload.error;
    if (isIdentityErrorCode(error.code) && typeof error.message === 'string') {
      return { code: error.code, message: error.message };
    }
  }
  return { code: 'SERVER_ERROR', message: 'The identity server request failed.' };
}

function inferPlatform(capabilities: IdentityCapabilities): 'ios' | 'android' | 'web' {
  if (capabilities.protocols.includes('apple-wallet')) {
    return 'ios';
  }
  if (capabilities.origin?.startsWith('android:apk-key-hash:')) {
    return 'android';
  }
  return 'web';
}

function parsePreparedResponse(payload: unknown): PreparedResponse {
  if (
    !isRecord(payload) ||
    typeof payload.transactionId !== 'string' ||
    payload.transactionId.length === 0 ||
    typeof payload.expiresAt !== 'string'
  ) {
    throw new TypeError('Invalid prepare response');
  }
  return {
    transactionId: payload.transactionId,
    expiresAt: payload.expiresAt,
    request: parseProtocolRequest(payload.request),
  };
}

export function createIdentityClient<TServer = IdentityServerTypeContract>(
  config: IdentityClientConfig = {}
): {
  prepare<TKey extends RequestKey<TServer>>(input: {
    request: TKey;
  }): Promise<IdentityClientResult<PreparedIdentityRequest<TServer, TKey>>>;
  verify<TKey extends RequestKey<TServer>>(input: {
    request: TKey;
  }): Promise<IdentityClientResult<Output<TServer, TKey>>>;
} {
  const fetchImplementation = config.fetch ?? globalThis.fetch;
  const handler = config.handler ?? defaultHandler;
  const baseURL = (config.baseURL ?? '').replace(/\/$/, '');
  const configuredBasePath = config.basePath ?? '/api/identity';
  const basePath = `/${configuredBasePath.replace(/^\/+|\/+$/g, '')}`;

  async function complete<TKey extends RequestKey<TServer>>(
    transactionId: string,
    credential: ProtocolCredential
  ): Promise<IdentityClientResult<Output<TServer, TKey>>> {
    let response: Response;
    try {
      response = await fetchImplementation(`${baseURL}${basePath}/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ transactionId, credential }),
      });
    } catch (error) {
      return {
        data: null,
        error: normalizeIdentityError(
          error,
          'NETWORK_ERROR',
          'Could not reach the identity server.'
        ),
      };
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return {
        data: null,
        error: {
          code: 'INVALID_RESPONSE',
          message: 'The identity server returned an invalid response.',
        },
      };
    }
    if (!response.ok) {
      return { data: null, error: clientErrorFromResponse(payload) };
    }
    return { data: payload as Output<TServer, TKey>, error: null };
  }

  async function prepare<TKey extends RequestKey<TServer>>(input: {
    request: TKey;
  }): Promise<IdentityClientResult<PreparedIdentityRequest<TServer, TKey>>> {
    let capabilities: IdentityCapabilities;
    try {
      capabilities = await handler.capabilities();
    } catch (error) {
      return {
        data: null,
        error: normalizeIdentityError(
          error,
          'UNAVAILABLE',
          'Digital identity presentation is unavailable on this platform.'
        ),
      };
    }

    let response: Response;
    try {
      response = await fetchImplementation(`${baseURL}${basePath}/prepare`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          request: input.request,
          platform: inferPlatform(capabilities),
          protocols: capabilities.protocols,
          origin: capabilities.origin,
        }),
      });
    } catch (error) {
      return {
        data: null,
        error: normalizeIdentityError(
          error,
          'NETWORK_ERROR',
          'Could not reach the identity server.'
        ),
      };
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return {
        data: null,
        error: {
          code: 'INVALID_RESPONSE',
          message: 'The identity server returned an invalid response.',
        },
      };
    }
    if (!response.ok) {
      return { data: null, error: clientErrorFromResponse(payload) };
    }

    let prepared: PreparedResponse;
    try {
      prepared = parsePreparedResponse(payload);
    } catch {
      return {
        data: null,
        error: {
          code: 'INVALID_RESPONSE',
          message: 'The identity server returned an invalid identity request.',
        },
      };
    }

    let state: 'ready' | 'presenting' | 'consumed' = 'ready';
    const result: PreparedIdentityRequest<TServer, TKey> = {
      expiresAt: prepared.expiresAt,
      async present() {
        if (state !== 'ready') {
          return {
            data: null,
            error: {
              code: 'REQUEST_IN_PROGRESS',
              message: 'This identity request is already in progress or has been used.',
            },
          };
        }
        state = 'presenting';
        if (Date.now() >= Date.parse(prepared.expiresAt)) {
          state = 'consumed';
          return {
            data: null,
            error: { code: 'EXPIRED', message: 'The identity request has expired.' },
          };
        }

        let credential: ProtocolCredential;
        try {
          credential = await handler.present(prepared.request);
        } catch (error) {
          state = 'consumed';
          return {
            data: null,
            error: normalizeIdentityError(
              error,
              'UNAVAILABLE',
              'Digital identity presentation failed.'
            ),
          };
        }

        state = 'consumed';
        return complete<TKey>(prepared.transactionId, credential);
      },
    };
    return { data: result, error: null };
  }

  async function verify<TKey extends RequestKey<TServer>>(input: {
    request: TKey;
  }): Promise<IdentityClientResult<Output<TServer, TKey>>> {
    const prepared = await prepare(input);
    if (prepared.error) {
      return prepared;
    }
    return prepared.data.present();
  }

  return { prepare, verify };
}
