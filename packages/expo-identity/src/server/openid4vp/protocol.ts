import { SessionTranscript } from "@owf/mdoc";
import {
  SignJWT,
  calculateJwkThumbprint,
  compactDecrypt,
  importJWK,
  type JWK,
} from "jose";

import {
  isRecord,
  type IdentityProtocol,
  type ProtocolRequest,
} from "../../shared/protocol";
import {
  resolveIdentityClaim,
  type IdentityRequestDefinition,
} from "../../shared/requests";
import type { InitializedServerCrypto } from "../crypto/initialize";
import { wintercgMdocContext } from "../crypto/mdoc-context";
import { base64urlToBytes } from "../crypto/wintercg-context";
import type { OpenId4VpConfiguration } from "../types";

export type OpenIdPrivateData = {
  encryptionPrivateJwk: Record<string, unknown>;
  jwkThumbprint: string;
};

function publicJwk(jwk: JsonWebKey): Record<string, unknown> {
  return { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, use: "enc" };
}

function privateJwk(jwk: JsonWebKey): Record<string, unknown> {
  return { ...publicJwk(jwk), d: jwk.d };
}

function requestedClaims(request: IdentityRequestDefinition) {
  return Object.values(request.claims).map((claim) => {
    const resolved = resolveIdentityClaim(request, claim);
    return {
      path: [resolved.namespace, resolved.identifier],
      intent_to_retain: resolved.retain,
    };
  });
}

function x5cBase64(crypto: InitializedServerCrypto): string[] {
  const signing = crypto.requestSigning;
  if (!signing) {
    throw new TypeError("OpenID signed request credentials are not configured");
  }
  return signing.certificates.map((certificate) =>
    certificate.toString("base64"),
  );
}

export async function createOpenId4VpProtocolRequest(input: {
  protocol: Extract<
    IdentityProtocol,
    "openid4vp-v1-signed" | "openid4vp-v1-unsigned"
  >;
  request: IdentityRequestDefinition;
  nonce: string;
  origin: string;
  configuration?: OpenId4VpConfiguration;
  crypto: InitializedServerCrypto;
}): Promise<{ request: ProtocolRequest; privateData: OpenIdPrivateData }> {
  const encryptionKeys = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const exportedPublic = await crypto.subtle.exportKey(
    "jwk",
    encryptionKeys.publicKey,
  );
  const exportedPrivate = await crypto.subtle.exportKey(
    "jwk",
    encryptionKeys.privateKey,
  );
  const responsePublicJwk = publicJwk(exportedPublic);
  const thumbprint = await calculateJwkThumbprint(responsePublicJwk);
  const clientMetadata = {
    ...(input.configuration?.clientMetadata ?? {}),
    jwks: { keys: [responsePublicJwk] },
    encrypted_response_alg_values_supported: ["ECDH-ES"],
    encrypted_response_enc_values_supported: ["A128GCM"],
    vp_formats_supported: {
      mso_mdoc: {
        issuerauth_alg_values: [-7],
        deviceauth_alg_values: [-7],
      },
    },
  };
  const payload: Record<string, unknown> = {
    response_type: "vp_token",
    response_mode: "dc_api.jwt",
    nonce: input.nonce,
    dcql_query: {
      credentials: [
        {
          id: "credential",
          format: "mso_mdoc",
          meta: { doctype_value: input.request.document.doctype },
          claims: requestedClaims(input.request),
        },
      ],
    },
    client_metadata: clientMetadata,
  };

  let data: Record<string, unknown> = payload;
  if (input.protocol === "openid4vp-v1-signed") {
    const signing = input.crypto.requestSigning;
    if (!signing) {
      throw new TypeError(
        "OpenID signed request credentials are not configured",
      );
    }
    payload.client_id = signing.clientId;
    payload.expected_origins = [input.origin];
    const requestObject = await new SignJWT(payload)
      .setProtectedHeader({
        alg: "ES256",
        typ: "oauth-authz-req+jwt",
        x5c: x5cBase64(input.crypto),
      })
      .sign(signing.privateKey);
    data = { request: requestObject };
  }

  return {
    request: { protocol: input.protocol, data },
    privateData: {
      encryptionPrivateJwk: privateJwk(exportedPrivate),
      jwkThumbprint: thumbprint,
    },
  };
}

function findVpToken(payload: unknown): string {
  if (!isRecord(payload)) {
    throw new TypeError("OpenID response payload must be an object");
  }
  if (typeof payload.vp_token === "string") {
    return payload.vp_token;
  }
  if (isRecord(payload.vp_token)) {
    const credential = payload.vp_token.credential;
    if (typeof credential === "string") {
      return credential;
    }
  }
  throw new TypeError("OpenID response does not contain one mdoc vp_token");
}

export async function decryptOpenId4VpCredential(input: {
  response: string;
  nonce: string;
  origin: string;
  privateData: Record<string, unknown>;
}): Promise<{ deviceResponse: Uint8Array; sessionTranscript: Uint8Array }> {
  const privateKey = await importJWK(
    input.privateData.encryptionPrivateJwk as JWK,
    "ECDH-ES",
  );
  const decrypted = await compactDecrypt(input.response, privateKey, {
    keyManagementAlgorithms: ["ECDH-ES"],
    contentEncryptionAlgorithms: ["A128GCM"],
  });
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(decrypted.plaintext));
  } catch (error) {
    throw new TypeError("OpenID response is not valid JSON", { cause: error });
  }
  const thumbprint = input.privateData.jwkThumbprint as string;
  const sessionTranscript = await SessionTranscript.forOid4VpDcApi(
    {
      origin: input.origin,
      nonce: input.nonce,
      jwkThumbprint: base64urlToBytes(thumbprint),
    },
    wintercgMdocContext,
  );
  return {
    deviceResponse: base64urlToBytes(findVpToken(payload)),
    sessionTranscript: sessionTranscript.encode(),
  };
}
