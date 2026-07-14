import { Buffer } from "buffer";
import { decode, encode as cborEncode } from "cbor2";
import {
	createHash,
	createPublicKey,
	createPrivateKey,
	webcrypto,
} from "node:crypto";
import {
	CipherSuite,
	DhkemP256HkdfSha256,
	HkdfSha256,
	Aes128Gcm,
} from "@hpke/core";

const CONTEXT_STRING = "AppleIdentityPresentment_1.0";
const EMPTY_AAD = new ArrayBuffer(0);

const suite = new CipherSuite({
	kem: new DhkemP256HkdfSha256(),
	kdf: new HkdfSha256(),
	aead: new Aes128Gcm(),
});

export type VerifyIdentityEnvelope = {
	algorithm: string;
	params: {
		mode: number;
		pkEm: Uint8Array;
		pkRHash: Uint8Array;
		infoHash: Uint8Array;
	};
	data: Uint8Array;
};

export type DecryptVerifyIdentityOptions = {
	encryptedData: string | Uint8Array | Buffer;
	nonce: string | Uint8Array | Buffer;
	merchantIdentifier: string;
	teamIdentifier: string;
	merchantPrivateKeyPem: string;
	encryptionKeyHash: string | Uint8Array | Buffer;
};

export type DecryptVerifyIdentityResult = {
	envelope: VerifyIdentityEnvelope;
	sessionTranscript: Buffer;
	plaintext: Buffer;
	identity: unknown;
};

function toBuffer(
	input: string | Uint8Array | Buffer,
	encoding: BufferEncoding = "base64",
) {
	if (typeof input === "string") {
		return Buffer.from(input, encoding);
	}
	if (Buffer.isBuffer(input)) {
		return input;
	}
	return Buffer.from(input);
}

function toArrayBuffer(
	input: string | Uint8Array | Buffer,
	encoding: BufferEncoding = "base64",
) {
	const buf = toBuffer(input, encoding);
	const start = buf.byteOffset;
	const end = buf.byteOffset + buf.byteLength;
	return buf.buffer.slice(start, end) as ArrayBuffer;
}

export function decodeVerifyIdentityEnvelope(
	input: string | Uint8Array | Buffer,
): VerifyIdentityEnvelope {
	const envelope = decode(toBuffer(input)) as VerifyIdentityEnvelope;
	if (!envelope?.params || !envelope.data) {
		throw new Error("Invalid Verify Identity response envelope");
	}
	envelope.params.pkEm = new Uint8Array(envelope.params.pkEm);
	envelope.params.pkRHash = new Uint8Array(envelope.params.pkRHash);
	envelope.params.infoHash = new Uint8Array(envelope.params.infoHash);
	envelope.data = new Uint8Array(envelope.data);
	return envelope;
}

export function computeEncryptionKeyHashFromCertificate(
	certPem: string,
): Buffer {
	const publicKey = createPublicKey(certPem);
	const jwk = publicKey.export({ format: "jwk" }) as { x?: string; y?: string };
	if (!jwk.x || !jwk.y) {
		throw new Error("Certificate public key is missing coordinates");
	}
	const x = Buffer.from(jwk.x, "base64url");
	const y = Buffer.from(jwk.y, "base64url");
	const uncompressed = Buffer.concat([Buffer.from([0x04]), x, y]);
	return createHash("sha256").update(uncompressed).digest();
}

export function buildSessionTranscript(
	nonce: Uint8Array,
	merchantIdentifier: string,
	teamIdentifier: string,
	encryptionKeyHash: Uint8Array,
): Buffer {
	const payload = cborEncode([
		null,
		null,
		[
			CONTEXT_STRING,
			new Uint8Array(nonce),
			merchantIdentifier,
			teamIdentifier,
			new Uint8Array(encryptionKeyHash),
		],
	]);

	return Buffer.from(payload);
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
	const keyObject = createPrivateKey({ key: pem, format: "pem" });
	const pkcs8Der = keyObject.export({ type: "pkcs8", format: "der" }) as Buffer;
	const derBuffer = pkcs8Der.buffer.slice(
		pkcs8Der.byteOffset,
		pkcs8Der.byteOffset + pkcs8Der.byteLength,
	);
	return webcrypto.subtle.importKey(
		"pkcs8",
		derBuffer,
		{ name: "ECDH", namedCurve: "P-256" },
		true,
		["deriveBits", "deriveKey"],
	);
}

export async function decryptVerifyIdentityResponse(
	options: DecryptVerifyIdentityOptions,
): Promise<DecryptVerifyIdentityResult> {
	const envelope = decodeVerifyIdentityEnvelope(options.encryptedData);
	if (envelope.algorithm !== "APPLE-HPKE-v1") {
		throw new Error(`Unsupported envelope algorithm: ${envelope.algorithm}`);
	}

	const nonce = toBuffer(options.nonce);
	if (!nonce.length) {
		throw new Error("Nonce must not be empty");
	}

	const pkRHash = toBuffer(options.encryptionKeyHash);
	if (!pkRHash.equals(Buffer.from(envelope.params.pkRHash))) {
		throw new Error("Encrypted payload was not intended for this merchant key");
	}

	const sessionTranscript = buildSessionTranscript(
		new Uint8Array(nonce),
		options.merchantIdentifier,
		options.teamIdentifier,
		envelope.params.pkRHash,
	);

	const infoHash = createHash("sha256").update(sessionTranscript).digest();
	if (!infoHash.equals(Buffer.from(envelope.params.infoHash))) {
		throw new Error("Session transcript hash mismatch");
	}

	const recipientContext = await suite.createRecipientContext({
		recipientKey: await importPrivateKey(options.merchantPrivateKeyPem),
		enc: toArrayBuffer(envelope.params.pkEm),
		info: toArrayBuffer(sessionTranscript),
	});

	const ciphertext = toArrayBuffer(envelope.data);
	const plaintextArrayBuffer = await recipientContext.open(
		ciphertext,
		EMPTY_AAD,
	);
	const plaintext = Buffer.from(new Uint8Array(plaintextArrayBuffer));
	const identity = decode(plaintext);

	return {
		envelope,
		sessionTranscript,
		plaintext,
		identity,
	};
}
