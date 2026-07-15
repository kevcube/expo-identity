import "reflect-metadata";

import { X509Certificate } from "@peculiar/x509";

const BASE64URL_PADDING: Record<number, string> = {
  0: "",
  2: "==",
  3: "=",
};

export function bytesToBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function base64urlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) {
    throw new TypeError("Invalid base64url value");
  }
  const padding = BASE64URL_PADDING[value.length % 4];
  if (padding === undefined) {
    throw new TypeError("Invalid base64url length");
  }
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + padding);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function pemToBytes(pem: string, label: string): Uint8Array {
  const expression = new RegExp(
    `^-----BEGIN ${label}-----\\s+([A-Za-z0-9+/=\\s]+)-----END ${label}-----\\s*$`,
  );
  const match = expression.exec(pem.trim());
  const body = match?.[1];
  if (!body) {
    throw new TypeError(`Invalid ${label} PEM`);
  }
  const binary = atob(body.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function encodeDerLength(length: number): Uint8Array {
  if (length < 128) {
    return Uint8Array.of(length);
  }
  if (length < 256) {
    return Uint8Array.of(0x81, length);
  }
  return Uint8Array.of(0x82, length >> 8, length & 0xff);
}

function encodeDer(tag: number, value: Uint8Array): Uint8Array {
  const length = encodeDerLength(value.length);
  const encoded = new Uint8Array(1 + length.length + value.length);
  encoded[0] = tag;
  encoded.set(length, 1);
  encoded.set(value, 1 + length.length);
  return encoded;
}

function concatenateBytes(...values: Uint8Array[]): Uint8Array {
  const length = values.reduce((total, value) => total + value.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const value of values) {
    output.set(value, offset);
    offset += value.length;
  }
  return output;
}

function sec1ToPkcs8(sec1: Uint8Array): Uint8Array {
  const version = Uint8Array.of(0x02, 0x01, 0x00);
  const ecPublicKeyOid = Uint8Array.of(
    0x06,
    0x07,
    0x2a,
    0x86,
    0x48,
    0xce,
    0x3d,
    0x02,
    0x01,
  );
  const p256Oid = Uint8Array.of(
    0x06,
    0x08,
    0x2a,
    0x86,
    0x48,
    0xce,
    0x3d,
    0x03,
    0x01,
    0x07,
  );
  const algorithm = encodeDer(0x30, concatenateBytes(ecPublicKeyOid, p256Oid));
  const privateKey = encodeDer(0x04, sec1);
  return encodeDer(0x30, concatenateBytes(version, algorithm, privateKey));
}

function privateKeyPkcs8(pem: string): ArrayBuffer {
  const pkcs8 = pem.includes("BEGIN EC PRIVATE KEY")
    ? sec1ToPkcs8(pemToBytes(pem, "EC PRIVATE KEY"))
    : pemToBytes(pem, "PRIVATE KEY");
  return Uint8Array.from(pkcs8).buffer;
}

export async function importP256PrivateKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    privateKeyPkcs8(pem),
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign"],
  );
}

export async function importP256EcdhPrivateKey(
  pem: string,
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    privateKeyPkcs8(pem),
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits", "deriveKey"],
  );
}

export function parseCertificate(pem: string): X509Certificate {
  return new X509Certificate(pem);
}

export async function certificatePublicKeyBytes(
  certificate: X509Certificate,
): Promise<Uint8Array> {
  const publicKey = await certificate.publicKey.export(
    { name: "ECDSA", namedCurve: "P-256" },
    ["verify"],
    crypto,
  );
  const jwk = await crypto.subtle.exportKey("jwk", publicKey);
  const x = base64urlToBytes(jwk.x!);
  const y = base64urlToBytes(jwk.y!);
  const uncompressed = new Uint8Array(1 + x.length + y.length);
  uncompressed[0] = 0x04;
  uncompressed.set(x, 1);
  uncompressed.set(y, 1 + x.length);
  return uncompressed;
}

export async function assertPrivateKeyMatchesCertificate(
  privateKeyPem: string,
  certificate: X509Certificate,
  path: string,
): Promise<CryptoKey> {
  const privateKey = await importP256PrivateKey(privateKeyPem);
  const publicKey = await certificate.publicKey.export(
    { name: "ECDSA", namedCurve: "P-256" },
    ["verify"],
    crypto,
  );
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    challenge,
  );
  const matches = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    signature,
    challenge,
  );
  if (!matches) {
    throw new TypeError(`${path} does not match its certificate`);
  }
  return privateKey;
}

export function randomBase64url(byteLength = 32): string {
  const value = new Uint8Array(byteLength);
  crypto.getRandomValues(value);
  return bytesToBase64url(value);
}

export async function sha256(value: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", Uint8Array.from(value).buffer),
  );
}
