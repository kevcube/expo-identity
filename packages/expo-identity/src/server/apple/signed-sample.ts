import {
  Aes128Gcm,
  CipherSuite,
  DhkemP256HkdfSha256,
  HkdfSha256,
} from "@hpke/core";
import { cborDecode, cborEncode } from "@owf/cose";

import { decodeAppleEnvelope } from "./protocol";
import { isRecord } from "../../shared/protocol";
import type { InitializedAppleCredential } from "../crypto/initialize";
import { base64urlToBytes, sha256 } from "../crypto/wintercg-context";

const EMPTY_AAD = new ArrayBuffer(0);
const hpkeSuite = new CipherSuite({
  kem: new DhkemP256HkdfSha256(),
  kdf: new HkdfSha256(),
  aead: new Aes128Gcm(),
});

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

function identityFromPlaintext(plaintext: Uint8Array): Uint8Array {
  const decoded: unknown = cborDecode(plaintext);
  let identity: unknown;
  if (decoded instanceof Map) {
    identity = decoded.get("identity");
  } else if (isRecord(decoded)) {
    identity = decoded.identity;
  }
  if (!(identity instanceof Map) && !isRecord(identity)) {
    throw new TypeError(
      "Apple sample plaintext does not contain an identity response",
    );
  }
  return cborEncode(identity);
}

export async function decryptSignedAppleSample(input: {
  encryptedData: string;
  nonce: Uint8Array;
  merchantIdentifier: string;
  teamIdentifier: string;
  credential: InitializedAppleCredential;
}): Promise<{ deviceResponse: Uint8Array; sessionTranscript: Uint8Array }> {
  const envelope = decodeAppleEnvelope(input.encryptedData);
  const expectedKeyHash = base64urlToBytes(input.credential.encryptionKeyHash);
  if (!equalBytes(envelope.pkRHash, expectedKeyHash)) {
    throw new TypeError(
      "Apple sample uses a different merchant encryption key",
    );
  }
  const sessionTranscript = cborEncode([
    null,
    null,
    [
      "AppleIdentityPresentment_1.0",
      input.nonce,
      input.merchantIdentifier,
      input.teamIdentifier,
      envelope.pkRHash,
    ],
  ]);
  if (!envelope.infoHash) {
    throw new TypeError("Apple sample envelope has no info hash");
  }
  if (!equalBytes(envelope.infoHash, await sha256(sessionTranscript))) {
    throw new TypeError("Apple sample transcript hash does not match");
  }
  const recipient = await hpkeSuite.createRecipientContext({
    recipientKey: input.credential.decryptionKey,
    enc: Uint8Array.from(envelope.pkEm).buffer,
    info: Uint8Array.from(sessionTranscript).buffer,
  });
  const plaintext = await recipient.open(
    Uint8Array.from(envelope.ciphertext).buffer,
    EMPTY_AAD,
  );
  return {
    deviceResponse: identityFromPlaintext(new Uint8Array(plaintext)),
    sessionTranscript,
  };
}
