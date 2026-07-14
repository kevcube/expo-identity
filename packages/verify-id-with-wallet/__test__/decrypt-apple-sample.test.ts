import { describe, expect, it } from "bun:test";
import { decode } from "cbor2";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
	buildSessionTranscript,
	computeEncryptionKeyHashFromCertificate,
	decryptVerifyIdentityResponse,
} from "../src/IdentityDecryption";
import {
	getAllElementValues,
	getElementValue,
} from "../src/identityParameters";

const sampleDir = fileURLToPath(
	new URL("./apple-sample-data/sample/", import.meta.url),
);

function readTextFile(filename: string): string {
	return readFileSync(join(sampleDir, filename), "utf8");
}

function readHexFile(filename: string): Buffer {
	return Buffer.from(readTextFile(filename).replace(/\s+/g, ""), "hex");
}

function parseSessionTranscriptParameters(): Record<string, string> {
	const lines = readTextFile("session_transcript_parameters.txt")
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);

	return Object.fromEntries(
		lines.map((line) => {
			const [rawKey, ...rest] = line.split(":");
			return [rawKey.trim(), rest.join(":").trim()];
		}),
	);
}

describe("decryptVerifyIdentityResponse", () => {
	it("decrypts the Apple sample envelope and exposes age metadata", async () => {
		const params = parseSessionTranscriptParameters();
		const encryptedEnvelope = readHexFile("hpke_envelope.cbor");
		const expectedSessionTranscript = readHexFile("session_transcript.txt");
		const expectedInfoHash = readHexFile("info_hash.txt");
		const expectedPlaintext = readHexFile("plaintext_topics.cbor");
		const merchantPrivateKey = readTextFile("merchant_encryption.key");
		const merchantCertificate = readTextFile("merchant_encryption.crt");

		const encryptionKeyHash =
			computeEncryptionKeyHashFromCertificate(merchantCertificate);

		expect(encryptionKeyHash.toString("hex")).toBe(
			params["Encryption Key Hash"].toLowerCase(),
		);

		const precomputedTranscript = buildSessionTranscript(
			new Uint8Array(Buffer.from(params["Nonce"], "hex")),
			params["Merchant ID"],
			params["Team ID"],
			new Uint8Array(encryptionKeyHash),
		);
		expect(precomputedTranscript.equals(expectedSessionTranscript)).toBe(true);

		const result = await decryptVerifyIdentityResponse({
			encryptedData: encryptedEnvelope,
			nonce: Buffer.from(params["Nonce"], "hex"),
			merchantIdentifier: params["Merchant ID"],
			teamIdentifier: params["Team ID"],
			merchantPrivateKeyPem: merchantPrivateKey,
			encryptionKeyHash,
		});

		expect(result.envelope.algorithm).toBe("APPLE-HPKE-v1");
		expect(
			Buffer.from(result.envelope.params.pkRHash).equals(encryptionKeyHash),
		).toBe(true);
		expect(result.sessionTranscript.equals(expectedSessionTranscript)).toBe(
			true,
		);
		expect(
			Buffer.from(result.envelope.params.infoHash).equals(expectedInfoHash),
		).toBe(true);

		const recalculatedInfoHash = createHash("sha256")
			.update(result.sessionTranscript)
			.digest();
		expect(
			recalculatedInfoHash.equals(Buffer.from(result.envelope.params.infoHash)),
		).toBe(true);

		expect(result.plaintext.equals(expectedPlaintext)).toBe(true);

		const decodedIdentity = decode(expectedPlaintext) as any;
		expect(result.identity).toEqual(decodedIdentity);

		const issuerEntries =
			decodedIdentity.identity.documents[0].issuerSigned.nameSpaces[
				"org.iso.18013.5.1"
			].map((entry: any) => decode(entry.contents));
		const ageEntry = issuerEntries.find(
			(entry: any) => entry.elementIdentifier === "age_in_years",
		);

		expect(ageEntry?.elementValue).toBe(42);

		expect(getElementValue(result.identity, "age_in_years")).toBe(42);
		const allValues = getAllElementValues(result.identity);
		expect(allValues.given_name.elementValue).toBe("Jane");
		expect(allValues.family_name.elementValue).toBe("Doe");
	});
});
