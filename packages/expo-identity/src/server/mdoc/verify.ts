import { DataItem, cborDecode, cborEncode } from "@owf/cose";
import {
  DateOnly,
  DeviceResponse,
  Verifier,
  type DeviceRequest,
  type Document,
  type VerificationAssessment,
} from "@owf/mdoc";

import type { IdentityProtocol } from "../../shared/protocol";
import {
  resolveIdentityClaim,
  type IdentityByteValue,
  type IdentityRequestClaims,
  type IdentityRequestDefinition,
  type JsonValue,
  type VerifiedIdentity,
} from "../../shared/requests";
import type { InitializedServerCrypto } from "../crypto/initialize";
import { wintercgMdocContext } from "../crypto/mdoc-context";
import { bytesToBase64url } from "../crypto/wintercg-context";

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left.at(index) ?? 0) ^ (right.at(index) ?? 0);
  }
  return difference === 0;
}

function normalizeMdocValue(value: unknown): JsonValue | IdentityByteValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("mdoc contains a non-finite number");
    }
    return Number.isSafeInteger(value) || !Number.isInteger(value)
      ? value
      : value.toLocaleString("fullwide", { useGrouping: false });
  }
  if (typeof value === "bigint") {
    return value.toString(10);
  }
  if (value instanceof DateOnly) {
    return value.toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Uint8Array) {
    return { base64url: bytesToBase64url(value) };
  }
  if (Array.isArray(value)) {
    return value.map(normalizeMdocValue);
  }
  if (value instanceof Map) {
    const normalized: Record<string, JsonValue | IdentityByteValue> = {};
    for (const [key, entry] of value) {
      if (typeof key !== "string") {
        throw new TypeError("mdoc map keys must be strings");
      }
      normalized[key] = normalizeMdocValue(entry);
    }
    return normalized;
  }
  if (typeof value === "object" && value !== null) {
    const normalized: Record<string, JsonValue | IdentityByteValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      normalized[key] = normalizeMdocValue(entry);
    }
    return normalized;
  }
  throw new TypeError(
    "mdoc contains a value that cannot be represented as JSON",
  );
}

function throwOnFailedCheck(assessment: VerificationAssessment): void {
  if (assessment.status === "FAILED") {
    throw new TypeError(assessment.check);
  }
}

async function verifyAppleDocument(input: {
  document: Document;
  sessionTranscript: Uint8Array;
  trustedCertificates: { issuance: Uint8Array[]; status: Uint8Array[] }[];
  now: Date;
}): Promise<void> {
  const deviceSignature =
    input.document.deviceSigned.deviceAuth.deviceSignature!;
  const deviceAuthentication = cborEncode(
    DataItem.fromData([
      "DeviceAuthentication",
      cborDecode(input.sessionTranscript),
      input.document.docType,
      DataItem.fromData(
        input.document.deviceSigned.deviceNamespaces.encodedStructure,
      ),
    ]),
  );
  const deviceKey =
    input.document.issuerSigned.issuerAuth.mobileSecurityObject.deviceKeyInfo
      .deviceKey;
  const validDeviceSignature = await wintercgMdocContext.cose.sign1.verify({
    toBeVerified: deviceSignature.toBeSigned({
      detachedPayload: deviceAuthentication,
    }),
    key: deviceKey,
    signature: deviceSignature.signature,
  });
  if (!validDeviceSignature) {
    throw new TypeError("Device signature is invalid");
  }
  const issuerAuth = input.document.issuerSigned.issuerAuth;
  const trustedChain = await wintercgMdocContext.x509.verifyCertificateChain({
    trustedCertificates: input.trustedCertificates.flatMap(
      ({ issuance }) => issuance,
    ),
    x5chain: issuerAuth.certificateChain,
    now: input.now,
  });
  const issuerPublicKey = await wintercgMdocContext.x509.getPublicKey({
    certificate: issuerAuth.certificate,
    algorithm: issuerAuth.algorithm,
  });
  if (
    !(await issuerAuth.verifySignature(
      { key: issuerPublicKey },
      wintercgMdocContext.cose.sign1,
    ))
  ) {
    throw new TypeError("Issuer signature is invalid");
  }
  const { validityInfo } = issuerAuth.mobileSecurityObject;
  const issuerCertificate = await wintercgMdocContext.x509.getCertificateData({
    certificate: issuerAuth.certificate,
  });
  if (
    !validityInfo.isSignedBetweenDates(
      issuerCertificate.notBefore,
      issuerCertificate.notAfter,
      30,
    ) ||
    !validityInfo.isValidFromBeforeNow(input.now, 30) ||
    !validityInfo.isValidUntilAfterNow(input.now, 30)
  ) {
    throw new TypeError("Issuer credential is outside its validity period");
  }
  const trustedRoot = trustedChain.chain.at(-1)!;
  const statusCertificates = input.trustedCertificates.find(({ issuance }) =>
    issuance.some((certificate) => equalBytes(certificate, trustedRoot)),
  )?.status;
  await issuerAuth.verifyStatus(
    {
      now: input.now,
      checkFreshness: true,
      trustedStatusCertificates: statusCertificates,
    },
    wintercgMdocContext,
  );
  for (const [namespace, items] of input.document.issuerSigned.issuerNamespaces
    .issuerNamespaces) {
    for (const item of items) {
      if (!(await item.isValid(namespace, issuerAuth, wintercgMdocContext))) {
        throw new TypeError(
          `Issuer digest is invalid for ${namespace}.${item.elementIdentifier}`,
        );
      }
    }
  }
}

export async function verifyMdocDeviceResponse<
  TRequestKey extends string,
  TRequest extends IdentityRequestDefinition,
>(input: {
  deviceResponse: Uint8Array;
  sessionTranscript: Uint8Array;
  requestKey: TRequestKey;
  request: TRequest;
  crypto: InitializedServerCrypto;
  protocol: IdentityProtocol;
  assurance: "verified" | "simulator";
  deviceRequest?: DeviceRequest;
  now?: Date;
}): Promise<VerifiedIdentity<TRequestKey, TRequest>> {
  let response: DeviceResponse;
  try {
    response = DeviceResponse.decode(input.deviceResponse);
  } catch (error) {
    throw new TypeError("Credential is not a valid ISO mdoc DeviceResponse", {
      cause: error,
    });
  }
  if (!equalBytes(response.encode(), input.deviceResponse)) {
    throw new TypeError("Credential uses noncanonical or malformed CBOR");
  }
  if (response.status !== 0) {
    throw new TypeError(`DeviceResponse status is ${response.status}`);
  }
  if ((response.documentErrors?.length ?? 0) !== 0) {
    throw new TypeError("DeviceResponse contains document errors");
  }
  if (response.documents?.length !== 1) {
    throw new TypeError("DeviceResponse must contain exactly one document");
  }
  const document = response.documents[0];
  if (!document || document.docType !== input.request.document.doctype) {
    throw new TypeError(
      "DeviceResponse document type does not match the request",
    );
  }
  if ((document.errors?.size ?? 0) !== 0) {
    throw new TypeError("DeviceResponse document contains errors");
  }
  if (document.deviceSigned.deviceAuth.deviceMac) {
    throw new TypeError("DeviceMAC responses are not accepted");
  }
  if (
    !document.deviceSigned.deviceAuth.deviceSignature &&
    input.assurance === "verified"
  ) {
    throw new TypeError("DeviceResponse is missing its device signature");
  }

  const itemsByNamespace = new Map<string, Map<string, unknown>>();
  for (const [namespace, items] of document.issuerSigned.issuerNamespaces
    .issuerNamespaces) {
    const values = new Map<string, unknown>();
    for (const item of items) {
      if (values.has(item.elementIdentifier)) {
        throw new TypeError(
          `DeviceResponse repeats ${namespace}.${item.elementIdentifier}`,
        );
      }
      values.set(item.elementIdentifier, item.elementValue);
    }
    itemsByNamespace.set(namespace, values);
  }

  if (input.assurance === "verified") {
    const trustedCertificates = input.crypto.trustAnchors.map((anchors) => ({
      issuance: anchors.issuance.map(
        (certificate) => new Uint8Array(certificate.rawData),
      ),
      status: anchors.status.map(
        (certificate) => new Uint8Array(certificate.rawData),
      ),
    }));
    if (trustedCertificates.length === 0) {
      throw new TypeError("No issuer trust anchors are configured");
    }
    if (input.protocol === "apple-wallet") {
      await verifyAppleDocument({
        document,
        sessionTranscript: input.sessionTranscript,
        trustedCertificates,
        now: input.now ?? new Date(),
      });
    } else {
      await Verifier.verifyDeviceResponse(
        {
          deviceResponse: response,
          deviceRequest: input.deviceRequest,
          sessionTranscript: input.sessionTranscript,
          trustedCertificates,
          now: input.now,
          onCheck: throwOnFailedCheck,
        },
        wintercgMdocContext,
      );
    }
  }

  const claims: Record<string, JsonValue | IdentityByteValue> = {};
  for (const [alias, claim] of Object.entries(input.request.claims)) {
    const resolved = resolveIdentityClaim(input.request, claim);
    const value = itemsByNamespace
      .get(resolved.namespace)
      ?.get(resolved.identifier);
    if (value === undefined) {
      throw new TypeError(
        `DeviceResponse is missing ${resolved.namespace}.${resolved.identifier}`,
      );
    }
    claims[alias] = normalizeMdocValue(value);
  }

  // Every key was derived from the validated request aliases above.
  const typedClaims = claims as IdentityRequestClaims<TRequest>;
  return {
    request: input.requestKey,
    assurance: input.assurance,
    document: {
      doctype: input.request.document.doctype,
      claims: typedClaims,
    },
  };
}
