import { createDecipheriv, randomBytes } from "crypto";

export type PublicKeyCredentialType = "public-key";

/**
 * Shape of the payload returned from the browser helper. All binary values are base64url strings.
 */
export interface BrowserAuthenticationAssertion {
  id: string;
  rawId: string;
  type: PublicKeyCredentialType;
  response: {
    authenticatorData: string;
    clientDataJSON: string;
    signature: string;
    userHandle?: string;
  };
  clientExtensionResults: Record<string, unknown>;
}

export interface NormalisedAssertion {
  id: string;
  rawId: Buffer;
  type: PublicKeyCredentialType;
  response: {
    authenticatorData: Buffer;
    clientDataJSON: Buffer;
    signature: Buffer;
    userHandle?: Buffer;
  };
  clientExtensionResults: Record<string, unknown>;
}

export interface EncryptedCredentialEnvelope {
  ciphertext: string;
  iv: string;
  tag: string;
  /** Optional associated data encoded as base64url or utf-8 depending on encoding flag. */
  associatedData?: string;
  /**
   * Encoding used for the ciphertext fields. Defaults to base64url.
   */
  encoding?: "base64url" | "base64" | "hex";
}

export interface DecryptOptions {
  /** Symmetric key material. Strings are interpreted as base64url unless encoding is provided. */
  key: Buffer | Uint8Array | string;
  /** Optional explicit encoding for the key string. */
  keyEncoding?: "base64url" | "base64" | "hex" | "utf8";
  /** AES mode to use. */
  algorithm?: "aes-256-gcm" | "aes-192-gcm" | "aes-128-gcm";
  /** Expected output encoding. If omitted a Buffer is returned. */
  outputEncoding?: BufferEncoding;
}

export function decodeBase64Url(value: string): Buffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}

function toBuffer(source: Buffer | Uint8Array | string, encoding: BufferEncoding | "base64url" | undefined): Buffer {
  if (Buffer.isBuffer(source)) {
    return source;
  }
  if (typeof source !== "string") {
    return Buffer.from(source);
  }

  if (!encoding || encoding === "base64url") {
    return decodeBase64Url(source);
  }

  if (encoding === "utf8") {
    return Buffer.from(source, "utf8");
  }

  return Buffer.from(source, encoding);
}

export function normaliseAssertion(assertion: BrowserAuthenticationAssertion): NormalisedAssertion {
  return {
    id: assertion.id,
    rawId: decodeBase64Url(assertion.rawId),
    type: assertion.type,
    response: {
      authenticatorData: decodeBase64Url(assertion.response.authenticatorData),
      clientDataJSON: decodeBase64Url(assertion.response.clientDataJSON),
      signature: decodeBase64Url(assertion.response.signature),
      userHandle: assertion.response.userHandle ? decodeBase64Url(assertion.response.userHandle) : undefined,
    },
    clientExtensionResults: assertion.clientExtensionResults,
  };
}

export function decryptCredentialEnvelope(
  envelope: EncryptedCredentialEnvelope,
  options: DecryptOptions,
): Buffer | string {
  const encoding = envelope.encoding ?? "base64url";
  const iv = toBuffer(envelope.iv, encoding);
  const ciphertext = toBuffer(envelope.ciphertext, encoding);
  const tag = toBuffer(envelope.tag, encoding);
  const aad = envelope.associatedData ? toBuffer(envelope.associatedData, encoding) : undefined;

  const algorithm = options.algorithm ?? "aes-256-gcm";
  const key = toBuffer(options.key, options.keyEncoding ?? "base64url");

  const decipher = createDecipheriv(algorithm, key, iv, { authTagLength: tag.length });
  decipher.setAuthTag(tag);
  if (aad) {
    decipher.setAAD(aad);
  }

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return options.outputEncoding ? decrypted.toString(options.outputEncoding) : decrypted;
}

export function generateRandomChallenge(length = 32): string {
  const bytes = randomBytes(length);
  return bytes
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
