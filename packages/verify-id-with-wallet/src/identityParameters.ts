import { Buffer } from "node:buffer";
import { decode } from "cbor2";

export const DEFAULT_NAMESPACE = "org.iso.18013.5.1";

export interface IdentityDocument {
	docType?: string;
	issuerSigned?: {
		nameSpaces?: Record<string, NamespaceEntry[]>;
		[key: string]: unknown;
	};
	deviceSigned?: unknown;
	[key: string]: unknown;
}

export interface IdentityPayload {
	status?: number;
	version?: string;
	documents?: IdentityDocument[];
	[key: string]: unknown;
}

export interface IssuerSignedItem {
	digestID?: number;
	random?: Buffer;
	elementIdentifier?: string;
	elementValue?: unknown;
	[key: string]: unknown;
}

export interface NamespaceEntry {
	tag?: number;
	contents?: unknown;
	[key: string]: unknown;
}

function normalizeBuffer(value: unknown): Buffer | null {
	if (!value) {
		return null;
	}
	if (Buffer.isBuffer(value)) {
		return value;
	}
	if (value instanceof Uint8Array) {
		return Buffer.from(value);
	}
	if (ArrayBuffer.isView(value)) {
		const view = value as ArrayBufferView;
		return Buffer.from(view.buffer, view.byteOffset, view.byteLength);
	}
	if (value instanceof ArrayBuffer) {
		return Buffer.from(value);
	}
	return null;
}

function decodeNamespaceEntry(entry: NamespaceEntry): IssuerSignedItem | null {
	const buf = normalizeBuffer(entry.contents);
	if (!buf) {
		return null;
	}

	const decoded = decode(buf) as IssuerSignedItem;
	if (!decoded || typeof decoded !== "object") {
		return null;
	}

	if (decoded.random && !Buffer.isBuffer(decoded.random)) {
		const randomBuf = normalizeBuffer(decoded.random);
		if (randomBuf) {
			decoded.random = randomBuf;
		}
	}

	return decoded;
}

function unwrapIdentity(identity: unknown): IdentityPayload | null {
	if (!identity || typeof identity !== "object") {
		return null;
	}

	if ("identity" in identity) {
		const value = (identity as { identity?: unknown }).identity;
		if (value && typeof value === "object") {
			return value as IdentityPayload;
		}
		return null;
	}

	return identity as IdentityPayload;
}

export function getIdentityPayload(identity: unknown): IdentityPayload | null {
	return unwrapIdentity(identity);
}

export function getDocuments(
	identity: unknown,
	docType?: string,
): IdentityDocument[] {
	const payload = unwrapIdentity(identity);
	if (!payload?.documents || !Array.isArray(payload.documents)) {
		return [];
	}

	const documents = payload.documents.filter(
		(doc) => !!doc,
	) as IdentityDocument[];
	if (!docType) {
		return documents;
	}

	return documents.filter((doc) => doc.docType === docType);
}

export function getIssuerSignedItems(
	identity: unknown,
	options: { docType?: string; namespace?: string } = {},
): IssuerSignedItem[] {
	const { docType, namespace = DEFAULT_NAMESPACE } = options;
	const documents = getDocuments(identity, docType);
	if (!documents.length) {
		return [];
	}

	const items: IssuerSignedItem[] = [];

	for (const doc of documents) {
		const issuerSigned = doc.issuerSigned;
		if (!issuerSigned || typeof issuerSigned !== "object") {
			continue;
		}

		const nameSpaces = issuerSigned.nameSpaces;
		if (!nameSpaces || typeof nameSpaces !== "object") {
			continue;
		}

		const entries = nameSpaces[namespace];
		if (!Array.isArray(entries)) {
			continue;
		}

		for (const entry of entries) {
			const decoded = decodeNamespaceEntry(entry);
			if (decoded) {
				items.push(decoded);
			}
		}
	}

	return items;
}

export function getElementValue(
	identity: unknown,
	elementIdentifier: string,
	options: { docType?: string; namespace?: string } = {},
): unknown {
	const items = getIssuerSignedItems(identity, options);
	const match = items.find(
		(item) => item.elementIdentifier === elementIdentifier,
	);
	return match?.elementValue;
}

export function getAllElementValues(
	identity: unknown,
	options: { docType?: string; namespace?: string } = {},
): Record<string, IssuerSignedItem> {
	const result: Record<string, IssuerSignedItem> = {};
	for (const item of getIssuerSignedItems(identity, options)) {
		if (!item.elementIdentifier) {
			continue;
		}
		result[item.elementIdentifier] = item;
	}
	return result;
}
