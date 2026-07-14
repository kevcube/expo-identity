import 'reflect-metadata';

import {
  BasicConstraintsExtension,
  type X509Certificate,
} from '@peculiar/x509';

import {
  APPLE_SIMULATOR_ENCRYPTION_CERTIFICATE,
  APPLE_SIMULATOR_ENCRYPTION_PRIVATE_KEY,
  APPLE_SIMULATOR_MERCHANT_IDENTIFIER,
  APPLE_SIMULATOR_TEAM_IDENTIFIER,
} from '../apple/simulator-material';
import type { IdentityRequestDefinitions } from '../../shared/requests';
import type { ExpoIdentityOptions } from '../types';
import {
  assertPrivateKeyMatchesCertificate,
  bytesToBase64url,
  certificatePublicKeyBytes,
  importP256EcdhPrivateKey,
  parseCertificate,
  sha256,
} from './wintercg-context';

export type InitializedCredential = {
  certificates: X509Certificate[];
  privateKey: CryptoKey;
};

export type InitializedAppleCredential = InitializedCredential & {
  mode: 'production' | 'simulator';
  merchantIdentifier: string;
  teamIdentifier: string;
  encryptionKeyHash: string;
  decryptionKey: CryptoKey;
};

export type InitializedServerCrypto = {
  apple?: InitializedAppleCredential;
  requestSigning?: InitializedCredential & { clientId: string };
  readerAuthentication?: InitializedCredential;
  trustAnchors: { issuance: X509Certificate[]; status: X509Certificate[] }[];
};

function parseCertificateChain(pems: string[], path: string): X509Certificate[] {
  return pems.map((pem, index) => {
    try {
      return parseCertificate(pem);
    } catch (error) {
      throw new TypeError(`${path}[${index}] is not a valid X.509 certificate`, {
        cause: error,
      });
    }
  });
}

async function assertCertificateChain(
  certificates: X509Certificate[],
  path: string
): Promise<void> {
  const now = new Date();
  for (const [index, certificate] of certificates.entries()) {
    if (certificate.notBefore > now || certificate.notAfter < now) {
      throw new TypeError(`${path}[${index}] is not currently valid`);
    }
    const issuer = certificates[index + 1];
    if (issuer && !(await certificate.verify({ publicKey: issuer }, crypto))) {
      throw new TypeError(`${path}[${index}] is not signed by the next certificate`);
    }
  }
}

function assertTrustAnchor(certificate: X509Certificate, path: string): void {
  const constraints = certificate.getExtension(BasicConstraintsExtension);
  if (!constraints?.ca) {
    throw new TypeError(`${path} must be a CA certificate`);
  }
}

async function initializeCredential(
  certificatePems: string[],
  privateKeyPem: string,
  path: string
): Promise<InitializedCredential> {
  const certificates = parseCertificateChain(certificatePems, `${path}.certificateChain`);
  await assertCertificateChain(certificates, `${path}.certificateChain`);
  const leaf = certificates[0];
  if (!leaf) {
    throw new TypeError(`${path}.certificateChain must not be empty`);
  }
  const privateKey = await assertPrivateKeyMatchesCertificate(
    privateKeyPem,
    leaf,
    `${path}.privateKey`
  );
  return { certificates, privateKey };
}

export async function initializeServerCrypto(
  options: ExpoIdentityOptions<IdentityRequestDefinitions, unknown>
): Promise<InitializedServerCrypto> {
  const trustAnchors = (options.trustAnchors ?? []).map((anchorSet, setIndex) => {
    const issuance = parseCertificateChain(
      anchorSet.issuance,
      `trustAnchors[${setIndex}].issuance`
    );
    const status = parseCertificateChain(
      anchorSet.status,
      `trustAnchors[${setIndex}].status`
    );
    issuance.forEach((certificate, certificateIndex) =>
      assertTrustAnchor(
        certificate,
        `trustAnchors[${setIndex}].issuance[${certificateIndex}]`
      )
    );
    status.forEach((certificate, certificateIndex) =>
      assertTrustAnchor(
        certificate,
        `trustAnchors[${setIndex}].status[${certificateIndex}]`
      )
    );
    return { issuance, status };
  });

  let apple: InitializedAppleCredential | undefined;
  if (options.apple) {
    const mode = options.apple.mode;
    const certificatePem =
      mode === 'simulator'
        ? APPLE_SIMULATOR_ENCRYPTION_CERTIFICATE
        : options.apple.encryptionCertificate;
    const privateKeyPem =
      mode === 'simulator'
        ? APPLE_SIMULATOR_ENCRYPTION_PRIVATE_KEY
        : options.apple.encryptionPrivateKey;
    const credential = await initializeCredential(
      [certificatePem],
      privateKeyPem,
      'apple'
    );
    const leaf = credential.certificates[0];
    if (!leaf) {
      throw new TypeError('apple encryption certificate is missing');
    }
    apple = {
      ...credential,
      mode,
      merchantIdentifier:
        mode === 'simulator'
          ? APPLE_SIMULATOR_MERCHANT_IDENTIFIER
          : options.apple.merchantIdentifier,
      teamIdentifier:
        mode === 'simulator'
          ? APPLE_SIMULATOR_TEAM_IDENTIFIER
          : options.apple.teamIdentifier,
      decryptionKey: await importP256EcdhPrivateKey(privateKeyPem),
      encryptionKeyHash: bytesToBase64url(
        await sha256(await certificatePublicKeyBytes(leaf))
      ),
    };
  }

  let requestSigning: InitializedServerCrypto['requestSigning'];
  if (options.openid4vp?.requestSigning) {
    const credential = await initializeCredential(
      options.openid4vp.requestSigning.certificateChain,
      options.openid4vp.requestSigning.privateKey,
      'openid4vp.requestSigning'
    );
    const leaf = credential.certificates[0];
    if (!leaf) {
      throw new TypeError('openid4vp.requestSigning certificate is missing');
    }
    requestSigning = {
      ...credential,
      clientId: `x509_hash:${bytesToBase64url(
        await sha256(new Uint8Array(leaf.rawData))
      )}`,
    };
  }

  let readerAuthentication: InitializedCredential | undefined;
  if (options.readerAuthentication) {
    readerAuthentication = await initializeCredential(
      options.readerAuthentication.certificateChain,
      options.readerAuthentication.privateKey,
      'readerAuthentication'
    );
  }

  return { apple, requestSigning, readerAuthentication, trustAnchors };
}
