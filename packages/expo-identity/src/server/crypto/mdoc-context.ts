import 'reflect-metadata';

import { CoseKey, MacAlgorithm, SignatureAlgorithm } from '@owf/cose';
import type { MdocContext } from '@owf/mdoc';
import { p256 } from '@noble/curves/nist.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { sha384, sha512 } from '@noble/hashes/sha2.js';
import { X509Certificate } from '@peculiar/x509';

import { bytesToBase64url } from './wintercg-context';

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

function digestBytes(
  algorithm: 'SHA-256' | 'SHA-384' | 'SHA-512',
  bytes: Uint8Array
): Uint8Array {
  if (algorithm === 'SHA-256') {
    return sha256(bytes);
  }
  if (algorithm === 'SHA-384') {
    return sha384(bytes);
  }
  return sha512(bytes);
}

function assertEs256(algorithm: number | undefined): void {
  if (algorithm !== undefined && algorithm !== SignatureAlgorithm.ES256) {
    throw new TypeError(`Unsupported COSE signature algorithm: ${algorithm}`);
  }
}

async function publicCoseKey(certificate: X509Certificate): Promise<CoseKey> {
  const cryptoKey = await certificate.publicKey.export(
    { name: 'ECDSA', namedCurve: 'P-256' },
    ['verify'],
    crypto
  );
  const jwk = await crypto.subtle.exportKey('jwk', cryptoKey);
  return CoseKey.fromJwk({ ...jwk, alg: 'ES256' });
}

function parseDerCertificate(value: Uint8Array): X509Certificate {
  return new X509Certificate(Uint8Array.from(value).buffer);
}

async function verifyChain(input: {
  trustedCertificates: Uint8Array[];
  x5chain: Uint8Array[];
  now?: Date;
}): Promise<{ chain: Uint8Array[] }> {
  if (input.x5chain.length === 0 || input.trustedCertificates.length === 0) {
    throw new TypeError('Certificate chain and trust anchors must not be empty');
  }
  const now = input.now ?? new Date();
  const chainBytes = input.x5chain.map((certificate) => Uint8Array.from(certificate));
  const chain = chainBytes.map(parseDerCertificate);
  const trusted = input.trustedCertificates.map((certificate) => ({
    bytes: Uint8Array.from(certificate),
    certificate: parseDerCertificate(certificate),
  }));

  for (const [index, certificate] of chain.entries()) {
    if (certificate.notBefore > now || certificate.notAfter < now) {
      throw new TypeError(`Certificate chain entry ${index} is not currently valid`);
    }
    const issuer = chain[index + 1];
    if (issuer && !(await certificate.verify({ publicKey: issuer, date: now }, crypto))) {
      throw new TypeError(`Certificate chain entry ${index} has an invalid signature`);
    }
  }

  const last = chain.at(-1)!;
  const lastBytes = chainBytes.at(-1)!;
  for (const anchor of trusted) {
    if (equalBytes(lastBytes, anchor.bytes)) {
      return { chain: chainBytes };
    }
    if (
      last.issuer === anchor.certificate.subject &&
      (await last.verify({ publicKey: anchor.certificate, date: now }, crypto))
    ) {
      return { chain: [...chainBytes, anchor.bytes] };
    }
  }
  throw new TypeError('Certificate chain does not terminate at a trusted anchor');
}

export const wintercgMdocContext: MdocContext = {
  fetch: globalThis.fetch,
  crypto: {
    random(length) {
      const bytes = new Uint8Array(length);
      crypto.getRandomValues(bytes);
      return bytes;
    },
    digest({ digestAlgorithm, bytes }) {
      return digestBytes(digestAlgorithm, bytes);
    },
    hdkf({ privateKey, publicKey, salt, info }) {
      const shared = p256.getSharedSecret(privateKey, publicKey, false).slice(1, 33);
      return hkdf(sha256, shared, salt, info, 32);
    },
  },
  cose: {
    sign1: {
      async sign({ toBeSigned, key, algorithm }) {
        assertEs256(algorithm);
        return p256.sign(toBeSigned, key.privateKey, { format: 'compact' });
      },
      async verify({ toBeVerified, signature, key, algorithm }) {
        assertEs256(algorithm);
        return p256.verify(signature, toBeVerified, key.publicKey, {
          format: 'compact',
          lowS: false,
        });
      },
    },
    mac0: {
      async authenticate({ toBeAuthenticated, key, algorithm }) {
        const keyBytes = key instanceof CoseKey ? key.privateKey : key;
        if (algorithm === MacAlgorithm.HS384) {
          return hmac(sha384, keyBytes, toBeAuthenticated);
        }
        if (algorithm === MacAlgorithm.HS512) {
          return hmac(sha512, keyBytes, toBeAuthenticated);
        }
        return hmac(sha256, keyBytes, toBeAuthenticated);
      },
      async verify({ toBeAuthenticated, tag, key, algorithm }) {
        const keyBytes = key instanceof CoseKey ? key.privateKey : key;
        const expected =
          algorithm === MacAlgorithm.HS384
            ? hmac(sha384, keyBytes, toBeAuthenticated)
            : algorithm === MacAlgorithm.HS512
              ? hmac(sha512, keyBytes, toBeAuthenticated)
              : hmac(sha256, keyBytes, toBeAuthenticated);
        return equalBytes(expected, tag);
      },
    },
  },
  x509: {
    getIssuerNameField({ certificate, field }) {
      return parseDerCertificate(certificate).issuerName.getField(field);
    },
    async getPublicKey({ certificate, algorithm }) {
      assertEs256(algorithm);
      return publicCoseKey(parseDerCertificate(certificate));
    },
    verifyCertificateChain: verifyChain,
    async getCertificateData({ certificate }) {
      const parsed = parseDerCertificate(certificate);
      return {
        issuerName: parsed.issuer,
        subjectName: parsed.subject,
        serialNumber: parsed.serialNumber,
        thumbprint: bytesToBase64url(
          new Uint8Array(await parsed.getThumbprint('SHA-256', crypto))
        ),
        notBefore: parsed.notBefore,
        notAfter: parsed.notAfter,
        pem: parsed.toString('pem'),
      };
    },
  },
};
