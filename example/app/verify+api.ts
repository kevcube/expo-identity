import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import {
  decryptVerifyIdentityResponse,
  computeEncryptionKeyHashFromCertificate,
} from "verify-id-with-wallet/src/IdentityDecryption";

export const runtime = "nodejs";

const MERCHANT_IDENTIFIER =
  process.env.MERCHANT_IDENTIFIER ?? "merchant.dog.icecube.identitytest";
const TEAM_IDENTIFIER =
  process.env.TEAM_IDENTIFIER ?? "PassKit_Identity_Test_Team_ID";

const KEY_PATH =
  process.env.MERCHANT_ENCRYPTION_KEY_PATH ??
  path.join(process.cwd(), "server/sample/merchant_encryption.key");
const CERT_PATH =
  process.env.MERCHANT_ENCRYPTION_CERT_PATH ??
  path.join(process.cwd(), "server/sample/merchant_encryption.crt");

function readRequiredPem(filePath: string, label: string) {
  if (!existsSync(filePath)) {
    throw new Error(
      `${label} not found at ${filePath}. Set MERCHANT_ENCRYPTION_KEY_PATH / MERCHANT_ENCRYPTION_CERT_PATH to valid files.`,
    );
  }
  return readFileSync(filePath, "utf8");
}

const merchantPrivateKeyPem = readRequiredPem(
  KEY_PATH,
  "Merchant encryption private key",
);
const merchantCertificatePem = readRequiredPem(
  CERT_PATH,
  "Merchant encryption certificate",
);
const encryptionKeyHash = computeEncryptionKeyHashFromCertificate(
  merchantCertificatePem,
);

function failure(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return failure("Invalid JSON body");
    }

    const {
      encryptedData,
      nonce,
      merchantIdentifier = MERCHANT_IDENTIFIER,
    } = body as {
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

    return new Response(JSON.stringify({ ok: true, identity }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Failed to process Verify Identity response", error);
    return failure(error?.message ?? "Unexpected server error", 500);
  }
}
