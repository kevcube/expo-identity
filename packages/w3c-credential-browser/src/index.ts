/**
 * Helpers for requesting verifiable credentials from the browser via the
 * W3C Credential Management APIs.
 */

export interface W3CAuthenticationOptions {
  /** Challenge supplied by the relying party. string values are UTF-8 encoded. */
  challenge: string | ArrayBuffer | Uint8Array;
  /** Optional relying party identifier. */
  rpId?: string;
  /** Credential IDs the client is allowed to use. */
  allowCredentials?: PublicKeyCredentialDescriptor[];
  /** Timeout in milliseconds (defaults to browser behaviour). */
  timeout?: number;
  /** Requested user verification behaviour. */
  userVerification?: UserVerificationRequirement;
  /** Optional client extensions. */
  extensions?: AuthenticationExtensionsClientInputs;
  /** Forwarded to `navigator.credentials.get` mediation parameter. */
  mediation?: CredentialMediationRequirement;
}

export interface W3CAuthenticationResult {
  id: string;
  rawId: string;
  type: PublicKeyCredentialType;
  response: {
    authenticatorData: string;
    clientDataJSON: string;
    signature: string;
    userHandle?: string;
  };
  clientExtensionResults: AuthenticationExtensionsClientOutputs;
}

/** Simple base64url encoding helper. */
export function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

const textEncoder = new TextEncoder();

function normaliseBuffer(source: string | ArrayBuffer | Uint8Array): ArrayBuffer {
  if (typeof source === "string") {
    return textEncoder.encode(source).buffer;
  }
  if (source instanceof ArrayBuffer) {
    return source;
  }
  if (ArrayBuffer.isView(source)) {
    return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
  }
  throw new TypeError("Unsupported challenge format");
}

export function isNavigatorCredentialSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.credentials && typeof navigator.credentials.get === "function";
}

export function isIdentityCredentialSupported(): boolean {
  return (
    isNavigatorCredentialSupported() &&
    typeof (navigator.credentials as any).get === "function" &&
    typeof (navigator.credentials as any).identity !== "undefined"
  );
}

export async function requestWebCredential(
  options: W3CAuthenticationOptions,
): Promise<W3CAuthenticationResult> {
  if (!isIdentityCredentialSupported()) {
    throw new Error("Identity credentials are not available in this environment");
  }

  const publicKeyOptions: PublicKeyCredentialRequestOptions = {
    challenge: normaliseBuffer(options.challenge),
    rpId: options.rpId,
    allowCredentials: options.allowCredentials,
    timeout: options.timeout,
    userVerification: options.userVerification,
    extensions: options.extensions,
  };

  const credential = (await navigator.credentials.get({
    publicKey: publicKeyOptions,
    mediation: options.mediation,
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error("Credential request was cancelled or returned no data");
  }

  const assertion = credential.response as AuthenticatorAssertionResponse;

  return {
    id: credential.id,
    rawId: toBase64Url(credential.rawId),
    type: credential.type,
    response: {
      authenticatorData: toBase64Url(assertion.authenticatorData),
      clientDataJSON: toBase64Url(assertion.clientDataJSON),
      signature: toBase64Url(assertion.signature),
      userHandle: assertion.userHandle ? toBase64Url(assertion.userHandle) : undefined,
    },
    clientExtensionResults: credential.getClientExtensionResults(),
  };
}

export interface IdentityProviderConfig {
  protocol: "openid4vp";
  request: string;
  requestId?: string;
  format?: string;
  clientId?: string;
}

export interface IdentityCredentialRequestOptions {
  providers: IdentityProviderConfig[];
  mediation?: CredentialMediationRequirement;
}

export interface IdentityCredentialResult {
  type: string;
  records?: unknown;
  token?: string;
  data?: unknown;
  [key: string]: unknown;
}

export async function requestIdentityCredential(
  options: IdentityCredentialRequestOptions,
): Promise<IdentityCredentialResult> {
  if (!isNavigatorCredentialSupported()) {
    throw new Error("navigator.credentials.get is not available in this environment");
  }

  const credential = (await navigator.credentials.get({
    identity: {
      providers: options.providers,
    },
    mediation: options.mediation,
  })) as IdentityCredentialResult | null;

  if (!credential) {
    throw new Error("Identity credential request was cancelled or returned no data");
  }

  if (credential.type !== "identity") {
    throw new Error(`Unexpected credential type: ${credential.type}`);
  }

  return credential;
}
