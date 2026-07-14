import {
  Aes128Gcm,
  CipherSuite,
  DhkemP256HkdfSha256,
  HkdfSha256,
} from '@hpke/core';
import { cborDecode, cborEncode } from '@owf/cose';

import {
  resolveIdentityClaim,
  type IdentityRequestDefinition,
} from '../../shared/requests';
import { isRecord, type ProtocolRequest } from '../../shared/protocol';
import type { InitializedAppleCredential } from '../crypto/initialize';
import {
  base64urlToBytes,
  sha256,
} from '../crypto/wintercg-context';

const HPKE_INFO = new TextEncoder().encode('AppleIdentityPresentation_1.0');
const EMPTY_AAD = new ArrayBuffer(0);

const hpkeSuite = new CipherSuite({
  kem: new DhkemP256HkdfSha256(),
  kdf: new HkdfSha256(),
  aead: new Aes128Gcm(),
});

export type AppleEnvelope = {
  pkEm: Uint8Array;
  pkRHash: Uint8Array;
  infoHash?: Uint8Array;
  ciphertext: Uint8Array;
};

function readContainerField(container: unknown, field: string): unknown {
  if (container instanceof Map) {
    return container.get(field);
  }
  if (isRecord(container)) {
    return container[field];
  }
  return undefined;
}

function requireBytes(value: unknown, path: string): Uint8Array {
  if (!(value instanceof Uint8Array)) {
    throw new TypeError(`${path} must be a byte string`);
  }
  return value;
}

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

export function decodeAppleEnvelope(encryptedData: string): AppleEnvelope {
  const decoded: unknown = cborDecode(base64urlToBytes(encryptedData));
  const algorithm = readContainerField(decoded, 'algorithm');
  const params = readContainerField(decoded, 'params');
  const ciphertext = readContainerField(decoded, 'data');
  if (algorithm !== 'APPLE-HPKE-v1') {
    throw new TypeError('Unsupported Apple identity envelope algorithm');
  }
  const infoHash = readContainerField(params, 'infoHash');
  return {
    pkEm: requireBytes(readContainerField(params, 'pkEm'), 'params.pkEm'),
    pkRHash: requireBytes(readContainerField(params, 'pkRHash'), 'params.pkRHash'),
    infoHash: infoHash === undefined ? undefined : requireBytes(infoHash, 'params.infoHash'),
    ciphertext: requireBytes(ciphertext, 'data'),
  };
}

export function createAppleProtocolRequest(
  request: IdentityRequestDefinition,
  nonce: string,
  credential: InitializedAppleCredential
): ProtocolRequest {
  if (!request.document.apple) {
    throw new TypeError('The selected request has no Apple document descriptor');
  }
  const elements = Object.entries(request.claims).map(([alias, claim]) => {
    const resolved = resolveIdentityClaim(request, claim);
    if (!resolved.appleElement) {
      throw new TypeError(`Claim ${alias} has no Apple identity element`);
    }
    return {
      alias,
      element: resolved.appleElement,
      retain: resolved.retain,
      retentionDays: resolved.retentionDays,
    };
  });
  return {
    protocol: 'apple-wallet',
    data: {
      merchantIdentifier: credential.merchantIdentifier,
      nonce,
      document: {
        kind: request.document.apple,
        elements,
      },
    },
  };
}

export async function decryptAppleCredential(input: {
  encryptedData: string;
  nonce: string;
  credential: InitializedAppleCredential;
}): Promise<{ deviceResponse: Uint8Array; sessionTranscript: Uint8Array }> {
  const envelope = decodeAppleEnvelope(input.encryptedData);
  const expectedKeyHash = base64urlToBytes(input.credential.encryptionKeyHash);
  if (!equalBytes(envelope.pkRHash, expectedKeyHash)) {
    throw new TypeError('Apple response was encrypted for a different merchant key');
  }

  const handover = [
    'InAppPresentment',
    [
      input.credential.merchantIdentifier,
      input.credential.teamIdentifier,
      base64urlToBytes(input.nonce),
      envelope.pkRHash,
    ],
  ];
  const sessionTranscript = cborEncode([null, null, handover]);
  if (envelope.infoHash) {
    const expectedInfoHash = await sha256(HPKE_INFO);
    if (!equalBytes(envelope.infoHash, expectedInfoHash)) {
      throw new TypeError('Apple response HPKE info hash is invalid');
    }
  }

  const recipient = await hpkeSuite.createRecipientContext({
    recipientKey: input.credential.decryptionKey,
    enc: Uint8Array.from(envelope.pkEm).buffer,
    info: Uint8Array.from(HPKE_INFO).buffer,
  });
  const plaintext = await recipient.open(
    Uint8Array.from(envelope.ciphertext).buffer,
    EMPTY_AAD
  );
  return {
    deviceResponse: new Uint8Array(plaintext),
    sessionTranscript,
  };
}

