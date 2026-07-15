import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { decryptSignedAppleSample } from "../server/apple/signed-sample";
import { initializeServerCrypto } from "../server/crypto/initialize";
import { expoIdentity } from "../server/index";
import {
  bytesToBase64url,
  parseCertificate,
} from "../server/crypto/wintercg-context";
import { verifyMdocDeviceResponse } from "../server/mdoc/verify";
import { createMemoryTransactionStore } from "../server/transaction-store";
import type { IdentityTransaction } from "../server/types";
import { defineIdentityRequests } from "../shared/requests";

const fixtureDirectory = join(
  __dirname,
  "fixtures",
  "apple-sample-data",
  "sample",
);

function fixtureText(name: string): string {
  return readFileSync(join(fixtureDirectory, name), "utf8").trim();
}

function hexFixture(name: string): Uint8Array {
  return new Uint8Array(Buffer.from(fixtureText(name), "hex"));
}

function sessionParameters(): Record<string, string> {
  return Object.fromEntries(
    fixtureText("session_transcript_parameters.txt")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf(":");
        return [
          line.slice(0, separator).trim(),
          line.slice(separator + 1).trim(),
        ];
      }),
  );
}

const requests = defineIdentityRequests({
  signedSample: {
    document: {
      doctype: "org.iso.18013.5.1.mDL",
      namespace: "org.iso.18013.5.1",
      apple: "driversLicense",
    },
    claims: {
      age: { type: "age", retain: false },
    },
  },
});

describe("signed Apple mdoc integration", () => {
  it("decrypts and verifies only the requested alias, transcript, and issuer", async () => {
    const params = sessionParameters();
    const merchantIdentifier = params["Merchant ID"];
    const teamIdentifier = params["Team ID"];
    const nonceHex = params.Nonce;
    const verificationTime = new Date("2022-04-01T00:00:00Z");
    if (!merchantIdentifier || !teamIdentifier || !nonceHex) {
      throw new Error("Apple sample session parameters are incomplete");
    }
    const options = {
      requests,
      transactionStore: createMemoryTransactionStore(),
      trustAnchors: [
        {
          issuance: [fixtureText("issuer_root.crt")],
          status: [],
        },
      ],
      apple: {
        mode: "production" as const,
        merchantIdentifier,
        teamIdentifier,
        encryptionCertificate: fixtureText("merchant_encryption.crt"),
        encryptionPrivateKey: fixtureText("merchant_encryption.key"),
      },
    };
    const initialized = await initializeServerCrypto(options);
    if (!initialized.apple) {
      throw new Error("Apple sample credentials did not initialize");
    }
    const decrypted = await decryptSignedAppleSample({
      encryptedData: bytesToBase64url(hexFixture("hpke_envelope.cbor")),
      nonce: new Uint8Array(Buffer.from(nonceHex, "hex")),
      merchantIdentifier,
      teamIdentifier,
      credential: initialized.apple,
    });
    const verified = await verifyMdocDeviceResponse({
      ...decrypted,
      requestKey: "signedSample",
      request: requests.signedSample,
      crypto: initialized,
      protocol: "apple-wallet",
      assurance: "verified",
      now: verificationTime,
    });

    assert.deepEqual(verified, {
      request: "signedSample",
      assurance: "verified",
      document: {
        doctype: "org.iso.18013.5.1.mDL",
        claims: { age: 42 },
      },
    });

    const changedTranscript = decrypted.sessionTranscript.slice();
    changedTranscript[changedTranscript.length - 1] ^= 1;
    await assert.rejects(() =>
      verifyMdocDeviceResponse({
        deviceResponse: decrypted.deviceResponse,
        sessionTranscript: changedTranscript,
        requestKey: "signedSample",
        request: requests.signedSample,
        crypto: initialized,
        protocol: "apple-wallet",
        assurance: "verified",
        now: verificationTime,
      }),
    );

    const untrustedCrypto = {
      ...initialized,
      trustAnchors: [
        {
          issuance: [parseCertificate(fixtureText("merchant_encryption.crt"))],
          status: [],
        },
      ],
    };
    await assert.rejects(() =>
      verifyMdocDeviceResponse({
        ...decrypted,
        requestKey: "signedSample",
        request: requests.signedSample,
        crypto: untrustedCrypto,
        protocol: "apple-wallet",
        assurance: "verified",
        now: verificationTime,
      }),
    );
  });

  it("completes signed simulator responses through the server handler", async () => {
    const params = sessionParameters();
    const merchantIdentifier = params["Merchant ID"];
    const nonceHex = params.Nonce;
    if (!merchantIdentifier || !nonceHex) {
      throw new Error("Apple sample session parameters are incomplete");
    }
    const nonce = bytesToBase64url(
      new Uint8Array(Buffer.from(nonceHex, "hex")),
    );
    const transactionStore = createMemoryTransactionStore();
    const server = expoIdentity({
      requests,
      transactionStore,
      apple: { mode: "simulator" },
    });
    await server.ready();
    const transaction: IdentityTransaction = {
      id: "signed-simulator-sample",
      requestKey: "signedSample",
      request: requests.signedSample,
      platform: "ios",
      protocol: "apple-wallet",
      nonce,
      expiresAt: Date.now() + 60_000,
      protocolRequest: {
        protocol: "apple-wallet",
        data: {
          merchantIdentifier,
          nonce,
          document: {
            kind: "driversLicense",
            elements: [{ alias: "age", element: "age", retain: false }],
          },
        },
      },
      privateData: {},
    };
    await transactionStore.set(transaction);

    const response = await server.handler(
      new Request("https://example.com/api/identity/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          transactionId: transaction.id,
          credential: {
            protocol: "apple-wallet",
            data: {
              encryptedData: bytesToBase64url(
                hexFixture("hpke_envelope.cbor"),
              ),
            },
          },
        }),
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      request: "signedSample",
      assurance: "simulator",
      document: {
        doctype: "org.iso.18013.5.1.mDL",
        claims: { age: 42 },
      },
    });
  });
});
