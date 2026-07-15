import type { DeviceRequest } from "@owf/mdoc";

import {
  isIdentityProtocol,
  isRecord,
  parseProtocolCredential,
  type IdentityProtocol,
} from "../shared/protocol";
import type { IdentityRequestDefinitions } from "../shared/requests";
import {
  createAppleProtocolRequest,
  decryptAppleCredential,
} from "./apple/protocol";
import { decryptSignedAppleSample } from "./apple/signed-sample";
import type { InitializedServerCrypto } from "./crypto/initialize";
import {
  base64urlToBytes,
  randomBase64url,
} from "./crypto/wintercg-context";
import {
  createIsoMdocProtocolRequest,
  decryptIsoMdocCredential,
} from "./iso-mdoc/protocol";
import { verifyMdocDeviceResponse } from "./mdoc/verify";
import {
  createOpenId4VpProtocolRequest,
  decryptOpenId4VpCredential,
} from "./openid4vp/protocol";
import type {
  ExpoIdentityOptions,
  IdentityPlatform,
  IdentityTransaction,
} from "./types";

type ServerErrorCode =
  | "UNAVAILABLE"
  | "INVALID_REQUEST"
  | "EXPIRED"
  | "INVALID_RESPONSE"
  | "UNTRUSTED_ISSUER"
  | "VERIFICATION_FAILED"
  | "SERVER_ERROR";

class IdentityServerError extends Error {
  readonly code: ServerErrorCode;
  readonly status: number;

  constructor(code: ServerErrorCode, message: string, status: number) {
    super(message);
    this.name = "IdentityServerError";
    this.code = code;
    this.status = status;
  }
}

function jsonResponse(
  data: unknown,
  init: ResponseInit = {},
  extraHeaders?: HeadersInit,
): Response {
  const body = JSON.stringify(data);
  if (body === undefined) {
    throw new TypeError(
      "Server callback must return a JSON-serializable value",
    );
  }
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (extraHeaders) {
    new Headers(extraHeaders).forEach((value, key) => headers.set(key, value));
  }
  return new Response(body, { ...init, headers });
}

function errorResponse(error: unknown, headers?: HeadersInit): Response {
  const normalized =
    error instanceof IdentityServerError
      ? error
      : new IdentityServerError(
          "SERVER_ERROR",
          "The identity server could not complete the request.",
          500,
        );
  return jsonResponse(
    { error: { code: normalized.code, message: normalized.message } },
    { status: normalized.status },
    headers,
  );
}

async function requestJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new IdentityServerError(
      "INVALID_REQUEST",
      "The request body must be valid JSON.",
      400,
    );
  }
}

function parsePlatform(value: unknown): IdentityPlatform {
  if (value === "ios" || value === "android" || value === "web") {
    return value;
  }
  throw new IdentityServerError(
    "INVALID_REQUEST",
    "The identity platform is invalid.",
    400,
  );
}

function parseProtocols(value: unknown): IdentityProtocol[] {
  if (!Array.isArray(value) || !value.every(isIdentityProtocol)) {
    throw new IdentityServerError(
      "INVALID_REQUEST",
      "The supported identity protocols are invalid.",
      400,
    );
  }
  return value;
}

async function originAllowed(
  options: ExpoIdentityOptions<IdentityRequestDefinitions, unknown>,
  origin: string,
  request: Request,
): Promise<boolean> {
  if (Array.isArray(options.trustedOrigins)) {
    return options.trustedOrigins.includes(origin);
  }
  if (typeof options.trustedOrigins === "function") {
    return options.trustedOrigins(origin, request);
  }
  return false;
}

async function validatedOrigin(
  options: ExpoIdentityOptions<IdentityRequestDefinitions, unknown>,
  platform: IdentityPlatform,
  claimedOrigin: unknown,
  request: Request,
): Promise<string | undefined> {
  if (platform === "ios") {
    if (claimedOrigin !== undefined) {
      throw new IdentityServerError(
        "INVALID_REQUEST",
        "iOS Apple Wallet requests do not use an origin.",
        400,
      );
    }
    return undefined;
  }
  if (typeof claimedOrigin !== "string" || claimedOrigin.length === 0) {
    throw new IdentityServerError(
      "INVALID_REQUEST",
      "An origin is required for this identity platform.",
      400,
    );
  }
  if (
    platform === "android" &&
    !claimedOrigin.startsWith("android:apk-key-hash:")
  ) {
    throw new IdentityServerError(
      "INVALID_REQUEST",
      "The Android application origin is invalid.",
      400,
    );
  }
  if (platform === "web") {
    let parsed: URL;
    try {
      parsed = new URL(claimedOrigin);
    } catch {
      throw new IdentityServerError(
        "INVALID_REQUEST",
        "The web origin is invalid.",
        400,
      );
    }
    if (parsed.origin !== claimedOrigin || !/^https?:$/.test(parsed.protocol)) {
      throw new IdentityServerError(
        "INVALID_REQUEST",
        "The web origin is invalid.",
        400,
      );
    }
    const headerOrigin = request.headers.get("origin");
    if (headerOrigin && headerOrigin !== claimedOrigin) {
      throw new IdentityServerError(
        "INVALID_REQUEST",
        "The request origin does not match the presented origin.",
        400,
      );
    }
  }
  if (!(await originAllowed(options, claimedOrigin, request))) {
    throw new IdentityServerError(
      "INVALID_REQUEST",
      "The identity request origin is not trusted.",
      403,
    );
  }
  return claimedOrigin;
}

function chooseProtocol(input: {
  platform: IdentityPlatform;
  protocols: IdentityProtocol[];
  hasAppleDocument: boolean;
  crypto: InitializedServerCrypto;
}): IdentityProtocol {
  if (input.platform === "ios") {
    if (
      input.hasAppleDocument &&
      input.crypto.apple &&
      input.protocols.includes("apple-wallet")
    ) {
      return "apple-wallet";
    }
  } else {
    if (
      input.crypto.requestSigning &&
      input.protocols.includes("openid4vp-v1-signed")
    ) {
      return "openid4vp-v1-signed";
    }
    if (input.protocols.includes("openid4vp-v1-unsigned")) {
      return "openid4vp-v1-unsigned";
    }
    if (
      input.platform === "web" &&
      input.crypto.readerAuthentication &&
      input.protocols.includes("org-iso-mdoc")
    ) {
      return "org-iso-mdoc";
    }
  }
  throw new IdentityServerError(
    "UNAVAILABLE",
    "No supported digital identity protocol is available.",
    400,
  );
}

async function prepareTransaction(input: {
  request: Request;
  options: ExpoIdentityOptions<IdentityRequestDefinitions, unknown>;
  crypto: InitializedServerCrypto;
}): Promise<Response> {
  const payload = await requestJson(input.request);
  if (!isRecord(payload) || typeof payload.request !== "string") {
    throw new IdentityServerError(
      "INVALID_REQUEST",
      "The configured identity request key is required.",
      400,
    );
  }
  const configuredRequest = input.options.requests[payload.request];
  if (!configuredRequest) {
    throw new IdentityServerError(
      "INVALID_REQUEST",
      "The identity request is not configured.",
      400,
    );
  }
  const platform = parsePlatform(payload.platform);
  const protocols = parseProtocols(payload.protocols);
  const origin = await validatedOrigin(
    input.options,
    platform,
    payload.origin,
    input.request,
  );
  const protocol = chooseProtocol({
    platform,
    protocols,
    hasAppleDocument: configuredRequest.document.apple !== undefined,
    crypto: input.crypto,
  });
  const id = randomBase64url();
  const nonce = randomBase64url();
  const expiresAt =
    Date.now() + (input.options.transactionTTLSeconds ?? 300) * 1000;
  let protocolRequest;
  let privateData: Record<string, unknown> = {};

  if (protocol === "apple-wallet") {
    if (!input.crypto.apple) {
      throw new IdentityServerError(
        "UNAVAILABLE",
        "Apple Wallet identity presentation is not configured.",
        400,
      );
    }
    protocolRequest = createAppleProtocolRequest(
      configuredRequest,
      nonce,
      input.crypto.apple,
    );
  } else if (
    protocol === "openid4vp-v1-signed" ||
    protocol === "openid4vp-v1-unsigned"
  ) {
    if (!origin) {
      throw new IdentityServerError(
        "INVALID_REQUEST",
        "OpenID4VP requires an origin.",
        400,
      );
    }
    const prepared = await createOpenId4VpProtocolRequest({
      protocol,
      request: configuredRequest,
      nonce,
      origin,
      configuration: input.options.openid4vp,
      crypto: input.crypto,
    });
    protocolRequest = prepared.request;
    privateData = prepared.privateData;
  } else {
    if (!origin) {
      throw new IdentityServerError(
        "INVALID_REQUEST",
        "org-iso-mdoc requires an origin.",
        400,
      );
    }
    const prepared = await createIsoMdocProtocolRequest({
      request: configuredRequest,
      nonce,
      origin,
      crypto: input.crypto,
    });
    protocolRequest = prepared.request;
    privateData = prepared.privateData;
  }

  const transaction: IdentityTransaction = {
    id,
    requestKey: payload.request,
    request: configuredRequest,
    platform,
    protocol,
    expectedOrigin: origin,
    nonce,
    expiresAt,
    protocolRequest,
    privateData,
  };
  await input.options.transactionStore.set(transaction);
  return jsonResponse({
    transactionId: id,
    expiresAt: new Date(expiresAt).toISOString(),
    request: protocolRequest,
  });
}

function requiredCredentialString(
  data: Record<string, unknown>,
  field: string,
): string {
  const value = data[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new IdentityServerError(
      "INVALID_RESPONSE",
      "The digital identity response is malformed.",
      400,
    );
  }
  return value;
}

async function completeTransaction(input: {
  request: Request;
  options: ExpoIdentityOptions<IdentityRequestDefinitions, unknown>;
  crypto: InitializedServerCrypto;
}): Promise<Response> {
  const payload = await requestJson(input.request);
  if (
    !isRecord(payload) ||
    typeof payload.transactionId !== "string" ||
    payload.transactionId.length === 0
  ) {
    throw new IdentityServerError(
      "INVALID_REQUEST",
      "The identity transaction ID is required.",
      400,
    );
  }

  const transaction = await input.options.transactionStore.take(
    payload.transactionId,
  );
  if (!transaction) {
    throw new IdentityServerError(
      "EXPIRED",
      "The identity request is expired or has already been used.",
      410,
    );
  }
  if (transaction.expiresAt <= Date.now()) {
    throw new IdentityServerError(
      "EXPIRED",
      "The identity request has expired.",
      410,
    );
  }

  let credential;
  try {
    credential = parseProtocolCredential(payload.credential);
  } catch {
    throw new IdentityServerError(
      "INVALID_RESPONSE",
      "The digital identity response is malformed.",
      400,
    );
  }
  if (credential.protocol !== transaction.protocol) {
    throw new IdentityServerError(
      "INVALID_RESPONSE",
      "The digital identity protocol does not match the request.",
      400,
    );
  }
  if (transaction.platform === "web") {
    const headerOrigin = input.request.headers.get("origin");
    if (headerOrigin && headerOrigin !== transaction.expectedOrigin) {
      throw new IdentityServerError(
        "INVALID_RESPONSE",
        "The completion origin does not match the request.",
        400,
      );
    }
  }

  try {
    let decrypted: {
      deviceResponse: Uint8Array;
      sessionTranscript: Uint8Array;
    };
    let deviceRequest: DeviceRequest | undefined;
    if (transaction.protocol === "apple-wallet") {
      if (!input.crypto.apple) {
        throw new TypeError("Apple verification credentials are unavailable");
      }
      const encryptedData = requiredCredentialString(
        credential.data,
        "encryptedData",
      );
      decrypted =
        input.crypto.apple.mode === "simulator"
          ? await decryptSignedAppleSample({
              encryptedData,
              nonce: base64urlToBytes(transaction.nonce),
              merchantIdentifier: input.crypto.apple.merchantIdentifier,
              teamIdentifier: input.crypto.apple.teamIdentifier,
              credential: input.crypto.apple,
            })
          : await decryptAppleCredential({
              encryptedData,
              nonce: transaction.nonce,
              credential: input.crypto.apple,
            });
    } else if (
      transaction.protocol === "openid4vp-v1-signed" ||
      transaction.protocol === "openid4vp-v1-unsigned"
    ) {
      if (!transaction.expectedOrigin) {
        throw new TypeError("OpenID transaction origin is missing");
      }
      decrypted = await decryptOpenId4VpCredential({
        response: requiredCredentialString(credential.data, "response"),
        nonce: transaction.nonce,
        origin: transaction.expectedOrigin,
        privateData: transaction.privateData,
      });
    } else {
      if (!transaction.expectedOrigin) {
        throw new TypeError("org-iso-mdoc transaction origin is missing");
      }
      const isoMdoc = await decryptIsoMdocCredential({
        response: requiredCredentialString(credential.data, "response"),
        origin: transaction.expectedOrigin,
        privateData: transaction.privateData,
      });
      decrypted = isoMdoc;
      deviceRequest = isoMdoc.deviceRequest;
    }

    const identity = await verifyMdocDeviceResponse({
      deviceResponse: decrypted.deviceResponse,
      sessionTranscript: decrypted.sessionTranscript,
      requestKey: transaction.requestKey,
      request: transaction.request,
      crypto: input.crypto,
      protocol: transaction.protocol,
      assurance:
        transaction.protocol === "apple-wallet" &&
        input.crypto.apple?.mode === "simulator"
          ? "simulator"
          : "verified",
      deviceRequest,
    });

    if (!input.options.onVerified) {
      return jsonResponse(identity);
    }
    let callbackResult: unknown;
    try {
      callbackResult = await input.options.onVerified(
        { identity, request: transaction.requestKey },
        input.request,
      );
    } catch {
      throw new IdentityServerError(
        "SERVER_ERROR",
        "The identity server callback failed.",
        500,
      );
    }
    return jsonResponse(callbackResult);
  } catch (error) {
    if (error instanceof IdentityServerError) {
      throw error;
    }
    throw new IdentityServerError(
      "VERIFICATION_FAILED",
      "The digital identity response could not be verified.",
      400,
    );
  }
}

function corsHeaders(origin: string): HeadersInit {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "Origin",
  };
}

export function createIdentityHandler(input: {
  basePath: string;
  options: ExpoIdentityOptions<IdentityRequestDefinitions, unknown>;
  crypto: Promise<InitializedServerCrypto>;
}): (request: Request) => Promise<Response> {
  return async (request) => {
    const path = new URL(request.url).pathname;
    const isPrepare = path === `${input.basePath}/prepare`;
    const isComplete = path === `${input.basePath}/complete`;
    if (!isPrepare && !isComplete) {
      return new Response(null, { status: 404 });
    }
    if (request.method !== "POST" && request.method !== "OPTIONS") {
      return new Response(null, {
        status: 405,
        headers: { allow: "POST, OPTIONS" },
      });
    }

    const origin = request.headers.get("origin");
    let headers: HeadersInit | undefined;
    if (origin && (await originAllowed(input.options, origin, request))) {
      headers = corsHeaders(origin);
    }
    if (request.method === "OPTIONS") {
      if (origin && !headers) {
        return new Response(null, { status: 403 });
      }
      return new Response(null, { status: 204, headers });
    }

    try {
      const cryptoState = await input.crypto;
      const response = isPrepare
        ? await prepareTransaction({
            request,
            options: input.options,
            crypto: cryptoState,
          })
        : await completeTransaction({
            request,
            options: input.options,
            crypto: cryptoState,
          });
      if (headers) {
        new Headers(headers).forEach((value, key) =>
          response.headers.set(key, value),
        );
      }
      return response;
    } catch (error) {
      return errorResponse(error, headers);
    }
  };
}
