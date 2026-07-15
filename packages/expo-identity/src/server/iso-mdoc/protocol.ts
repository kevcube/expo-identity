import {
  Aes128Gcm,
  CipherSuite,
  DhkemP256HkdfSha256,
  HkdfSha256,
} from "@hpke/core";
import {
  CoseKey,
  DataItem,
  RegisteredCwtHeaderClaimKey,
  SignatureAlgorithm,
  cborDecode,
  cborEncode,
} from "@owf/cose";
import {
  DeviceRequest,
  DocRequest,
  ItemsRequest,
  ReaderAuth,
  SessionTranscript,
} from "@owf/mdoc";

import { isRecord, type ProtocolRequest } from "../../shared/protocol";
import {
  resolveIdentityClaim,
  type IdentityRequestDefinition,
} from "../../shared/requests";
import type { InitializedServerCrypto } from "../crypto/initialize";
import { wintercgMdocContext } from "../crypto/mdoc-context";
import { base64urlToBytes, bytesToBase64url } from "../crypto/wintercg-context";

const EMPTY_AAD = new ArrayBuffer(0);
const hpkeSuite = new CipherSuite({
  kem: new DhkemP256HkdfSha256(),
  kdf: new HkdfSha256(),
  aead: new Aes128Gcm(),
});

export type IsoMdocPrivateData = {
  encryptionPrivateJwk: Record<string, unknown>;
  encryptionInfo: string;
  deviceRequest: string;
};

function p256Jwk(jwk: JsonWebKey): Record<string, unknown> {
  return {
    kty: jwk.kty,
    crv: jwk.crv,
    x: jwk.x,
    y: jwk.y,
    ...(jwk.d ? { d: jwk.d } : {}),
  };
}

function claimNamespaces(
  request: IdentityRequestDefinition,
): Record<string, Record<string, boolean>> {
  const namespaces: Record<string, Record<string, boolean>> = {};
  for (const claim of Object.values(request.claims)) {
    const resolved = resolveIdentityClaim(request, claim);
    const namespace = namespaces[resolved.namespace] ?? {};
    namespace[resolved.identifier] = resolved.retain;
    namespaces[resolved.namespace] = namespace;
  }
  return namespaces;
}

async function readerSigningKey(
  cryptoState: InitializedServerCrypto,
): Promise<CoseKey> {
  const reader = cryptoState.readerAuthentication;
  if (!reader) {
    throw new TypeError("Reader authentication is not configured");
  }
  const jwk = await crypto.subtle.exportKey("jwk", reader.privateKey);
  return CoseKey.fromJwk({ ...jwk, alg: "ES256" });
}

function readerCertificateChain(
  cryptoState: InitializedServerCrypto,
): Uint8Array[] {
  const reader = cryptoState.readerAuthentication;
  if (!reader) {
    throw new TypeError("Reader authentication is not configured");
  }
  return reader.certificates.map(
    (certificate) => new Uint8Array(certificate.rawData),
  );
}

export async function createIsoMdocProtocolRequest(input: {
  request: IdentityRequestDefinition;
  nonce: string;
  origin: string;
  crypto: InitializedServerCrypto;
}): Promise<{ request: ProtocolRequest; privateData: IsoMdocPrivateData }> {
  const encryptionKeys = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const publicJwk = await crypto.subtle.exportKey(
    "jwk",
    encryptionKeys.publicKey,
  );
  const privateJwk = await crypto.subtle.exportKey(
    "jwk",
    encryptionKeys.privateKey,
  );
  const publicCoseKey = CoseKey.fromJwk(p256Jwk(publicJwk));
  const encryptionInfoBytes = cborEncode([
    "dcapi",
    new Map<string, unknown>([
      ["nonce", base64urlToBytes(input.nonce)],
      ["recipientPublicKey", DataItem.fromBuffer(publicCoseKey.encode())],
    ]),
  ]);
  const encryptionInfo = bytesToBase64url(encryptionInfoBytes);
  const sessionTranscript = await SessionTranscript.forIsoMdocDcApi(
    { encryptionInfoBase64Url: encryptionInfo, origin: input.origin },
    wintercgMdocContext,
  );
  const itemsRequest = ItemsRequest.create({
    docType: input.request.document.doctype,
    namespaces: claimNamespaces(input.request),
  });
  const readerAuthentication = cborEncode(
    DataItem.fromData([
      "ReaderAuthentication",
      sessionTranscript.encodedStructure,
      DataItem.fromBuffer(itemsRequest.encode()),
    ]),
  );
  const certificates = readerCertificateChain(input.crypto);
  const readerAuth = ReaderAuth.create({
    protectedHeaders: new Map<number, unknown>([
      [RegisteredCwtHeaderClaimKey.Algorithm, SignatureAlgorithm.ES256],
      [
        RegisteredCwtHeaderClaimKey.X5Chain,
        certificates.length === 1 ? certificates[0] : certificates,
      ],
    ]),
    payload: null,
  });
  await readerAuth.sign(
    {
      signingKey: await readerSigningKey(input.crypto),
      algorithm: SignatureAlgorithm.ES256,
      detachedPayload: readerAuthentication,
    },
    wintercgMdocContext.cose.sign1,
  );
  const deviceRequest = DeviceRequest.create({
    docRequests: [DocRequest.create({ itemsRequest, readerAuth })],
  });
  const encodedDeviceRequest = bytesToBase64url(deviceRequest.encode());

  return {
    request: {
      protocol: "org-iso-mdoc",
      data: {
        deviceRequest: encodedDeviceRequest,
        encryptionInfo,
      },
    },
    privateData: {
      encryptionPrivateJwk: p256Jwk(privateJwk),
      encryptionInfo,
      deviceRequest: encodedDeviceRequest,
    },
  };
}

function readEncryptionParameter(value: unknown, key: string): unknown {
  if (value instanceof Map) {
    return value.get(key);
  }
  if (isRecord(value)) {
    return value[key];
  }
  return undefined;
}

function parseEncryptedResponse(response: string): {
  enc: Uint8Array;
  cipherText: Uint8Array;
} {
  const decoded: unknown = cborDecode(base64urlToBytes(response));
  if (!Array.isArray(decoded) || decoded[0] !== "dcapi") {
    throw new TypeError("org-iso-mdoc response has an invalid envelope");
  }
  const parameters = decoded[1];
  const enc = readEncryptionParameter(parameters, "enc");
  const cipherText = readEncryptionParameter(parameters, "cipherText");
  if (!(enc instanceof Uint8Array) || !(cipherText instanceof Uint8Array)) {
    throw new TypeError(
      "org-iso-mdoc response encryption parameters are invalid",
    );
  }
  return { enc, cipherText };
}

export async function decryptIsoMdocCredential(input: {
  response: string;
  origin: string;
  privateData: Record<string, unknown>;
}): Promise<{
  deviceResponse: Uint8Array;
  sessionTranscript: Uint8Array;
  deviceRequest: DeviceRequest;
}> {
  const envelope = parseEncryptedResponse(input.response);
  const encryptionInfo = input.privateData.encryptionInfo;
  const encodedDeviceRequest = input.privateData.deviceRequest;
  if (
    typeof encryptionInfo !== "string" ||
    typeof encodedDeviceRequest !== "string"
  ) {
    throw new TypeError("Stored org-iso-mdoc request data is invalid");
  }
  const sessionTranscript = await SessionTranscript.forIsoMdocDcApi(
    { encryptionInfoBase64Url: encryptionInfo, origin: input.origin },
    wintercgMdocContext,
  );
  const recipientKey = await crypto.subtle.importKey(
    "jwk",
    input.privateData.encryptionPrivateJwk as JsonWebKey,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits", "deriveKey"],
  );
  const recipient = await hpkeSuite.createRecipientContext({
    recipientKey,
    enc: Uint8Array.from(envelope.enc).buffer,
    info: Uint8Array.from(sessionTranscript.encode()).buffer,
  });
  const plaintext = await recipient.open(
    Uint8Array.from(envelope.cipherText).buffer,
    EMPTY_AAD,
  );
  return {
    deviceResponse: new Uint8Array(plaintext),
    sessionTranscript: sessionTranscript.encode(),
    deviceRequest: DeviceRequest.decode(base64urlToBytes(encodedDeviceRequest)),
  };
}
