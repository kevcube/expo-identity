import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import {
  decryptVerifyIdentityResponse,
  computeEncryptionKeyHashFromCertificate,
} from "expo-identity/server";

export const runtime = "nodejs";

const MERCHANT_IDENTIFIER =
  process.env.MERCHANT_IDENTIFIER ?? "merchant.dog.icecube.identitytest";
const TEAM_IDENTIFIER = process.env.TEAM_IDENTIFIER ?? "PassKit_Identity_Test_Team_ID";

const KEY_PATH =
  process.env.MERCHANT_ENCRYPTION_KEY_PATH ??
  path.join(process.cwd(), "server/sample/merchant_encryption.key");
const CERT_PATH =
  process.env.MERCHANT_ENCRYPTION_CERT_PATH ??
  path.join(process.cwd(), "server/sample/merchant_encryption.crt");

function readRequiredPem(filePath: string, label: string) {
  if (!existsSync(filePath)) {
    throw new Error(
      `${label} not found at ${filePath}. Set MERCHANT_ENCRYPTION_KEY_PATH / MERCHANT_ENCRYPTION_CERT_PATH to valid files.`
    );
  }
  return readFileSync(filePath, "utf8");
}

const merchantPrivateKeyPem = readRequiredPem(KEY_PATH, "Merchant encryption private key");
const merchantCertificatePem = readRequiredPem(CERT_PATH, "Merchant encryption certificate");
const encryptionKeyHash = computeEncryptionKeyHashFromCertificate(merchantCertificatePem);

function failure(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function normalizeElementValue(value: unknown): unknown {
  if (value == null) {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return value.toString("base64");
  }
  if (Array.isArray(value)) {
    return value.map(normalizeElementValue);
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.tag === "number" && "value" in record) {
      return normalizeElementValue(record.value);
    }
    const normalized: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(record)) {
      normalized[key] = normalizeElementValue(entry);
    }
    return normalized;
  }
  return value;
}

function extractNamespaceElements(entries: any[] | undefined): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const entry of entries ?? []) {
    if (!entry || typeof entry !== "object") continue;
    const identifier = (entry as any).elementIdentifier;
    if (!identifier) continue;
    result[identifier] = normalizeElementValue((entry as any).elementValue);
  }
  return result;
}

function buildDocumentSummary(doc: any) {
  const issuerNamespaces = doc?.issuerSigned?.nameSpaces ?? {};
  const isoElements = extractNamespaceElements(issuerNamespaces["org.iso.18013.5.1"]);
  const ageInYears = typeof isoElements.age_in_years === "number" ? isoElements.age_in_years : undefined;
  const ageThreshold = 21;
  const thresholdFromElement = typeof isoElements.age_over_21 === "boolean" ? isoElements.age_over_21 : undefined;
  const ageThresholdMet = thresholdFromElement ?? (typeof ageInYears === "number" ? ageInYears >= ageThreshold : undefined);

  const givenName = typeof isoElements.given_name === "string" ? isoElements.given_name : undefined;
  const familyName = typeof isoElements.family_name === "string" ? isoElements.family_name : undefined;
  const fullName = [givenName, familyName].filter(Boolean).join(" ") || undefined;

  const birthDate = typeof isoElements.birth_date === "string" ? isoElements.birth_date : undefined;

  return {
    docType: doc?.docType,
    elements: isoElements,
    ageInYears,
    ageThreshold,
    ageThresholdMet,
    fullName,
    givenName,
    familyName,
    birthDate,
  };
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return failure("Invalid JSON body");
    }

    const { encryptedData, nonce, merchantIdentifier = MERCHANT_IDENTIFIER } = body as {
      encryptedData?: string;
      nonce?: string;
      merchantIdentifier?: string;
    };

    if (!encryptedData || typeof encryptedData !== "string") {
      return failure("`encryptedData` must be a base64 string");
    }

    if (!nonce || typeof nonce !== "string") {
      return failure("`nonce` must be a base64 string");
    }

    const { identity } = await decryptVerifyIdentityResponse({
      encryptedData,
      nonce,
      merchantIdentifier,
      teamIdentifier: TEAM_IDENTIFIER,
      merchantPrivateKeyPem,
      encryptionKeyHash,
    });

    const documents = Array.isArray(identity?.identity?.documents)
      ? identity.identity.documents.map(buildDocumentSummary)
      : [];

    const primaryDocument = documents[0];

    return new Response(
      JSON.stringify({
        ok: true,
        identity,
        documents,
        ageVerification: {
          threshold: primaryDocument?.ageThreshold ?? 21,
          ageInYears: primaryDocument?.ageInYears ?? null,
          thresholdMet: primaryDocument?.ageThresholdMet ?? null,
        },
      }),
      status: 200,
      headers: { "Content-Type": "application/json" },
    );
  } catch (error: any) {
    console.error("Failed to process Verify Identity response", error);
    return failure(error?.message ?? "Unexpected server error", 500);
  }
}
