export type IdentityDocument = "driversLicense" | "nationalIDCard" | "photoID" | "anyOf";

// export type IdentityElement

// Common elements available across all document types
export type CommonElements =
	| "givenName"
	| "familyName"
	| "portrait"
	| "address"
	| "documentNumber"
	| "dateOfBirth"
	| "age"
	| "sex";

// Driver's license specific elements
export type DriversLicenseRequestableElements =
	| "issuingAuthority"
	| "documentExpirationDate"
	| "documentIssueDate"
	| "drivingPrivilege";

// Photo ID specificypes elements
export type PhotoIDRequestableElements =
	| "issuingAuthority"
	| "documentIssueDate"
	| "documentExpirationDate";

export enum VerifyIdentityWithWalletButtonLabelEnum {
	Continue = "continue",
	Verify = "verify",
	VerifyAge = "verifyAge",
	VerifyIdentity = "verifyIdentity",
}

export type VerifyIdentityWithWalletButtonLabel =
	(typeof VerifyIdentityWithWalletButtonLabelEnum)[keyof typeof VerifyIdentityWithWalletButtonLabelEnum];

export enum VerifyIdentityWithWalletButtonStyleEnum {
	Black = "black",
	BlackOutline = "blackOutline",
}

export type VerifyIdentityWithWalletButtonStyle =
	(typeof VerifyIdentityWithWalletButtonStyleEnum)[keyof typeof VerifyIdentityWithWalletButtonStyleEnum];

// Allow any string to support future elements or custom implementations
export type FlexibleIdentityElement = string;

// Union of all known elements plus flexible string support
export type IdentityElement =
	| CommonElements
	| DriversLicenseRequestableElements
	| PhotoIDRequestableElements
	| FlexibleIdentityElement;

/**
 * Parameterised age‑check element.
 * Example usage inside `elements`:
 *   { type: "ageAtLeast", threshold: 21 }
 */
export type AgeAtLeastElement = {
	type: "ageAtLeast";
	threshold: number;
};

/**
 * Intent to store identity document data
 */
export type IntentToStore = {
	intentToStore: "willNotStore" | "mayStore";
	days?: number;
};


/**
 * Compile‑time helper that rejects arrays/tuples containing duplicate items.
 * When the compiler detects a duplicate, the type resolves to `never`,
 * causing an error at the usage site.
 *
 * ```ts
 * // ✅ ok
 * const ok: UniqueArray<["givenName", "familyName"]> = ["givenName", "familyName"];
 *
 * // ❌ error – duplicate element
 * const bad: UniqueArray<["givenName", "givenName"]> = ["givenName", "givenName"];
 * ```
 */
export type UniqueArray<
	T extends readonly any[],
	Seen extends readonly any[] = [],
> = T extends readonly [infer Head, ...infer Tail]
	? Head extends Seen[number]
		? never
		: UniqueArray<Tail, [...Seen, Head]>
	: T;

/**
 * Shape of a request passed to `requestIdentityDocument(…)`.
 *
 * • Each document type can appear **at most once** (object keys are unique).
 * • For every requested document, the elements list is validated by
 *   `UniqueArray` so the same element may not be requested twice.
 * • IMPORTANT: Cannot use both "age" and { type: "ageAtLeast", … } in the same request
 * • To request an age threshold, include an object { type: "ageAtLeast", threshold: n }.
 *   You may not combine { type: "ageAtLeast", … } with the plain "age" element in the same document.
 * • "dateOfBirth" can be used with either "age" or { type: "ageAtLeast", … }
 * • ageThresholdElement is a separate field that takes a number parameter.
 *
 * Example:
 * ```ts
 * const request: IdentityDocumentRequest = {
 *   driversLicense: ["givenName", "familyName", "age", "dateOfBirth"], // ✅ ok
 *   nationalIDCard: ["portrait", { type: "ageAtLeast", threshold: 21 }], // ✅ ok - different from age
 *   photoID: ["givenNameElement"],
 *   ageThresholdElement: 21, // ✅ ok if no "age" elements used above
 * };
 * ```
 */
export interface IdentityDocumentRequest {
  /**
   * Apple Pay merchant identifier required for Verify Identity with Wallet.
   * Example: "merchant.com.example". This must match an Apple Pay Merchant ID
   * that your app is entitled to use in the Apple Developer portal/Xcode.
   */
  merchantIdentifier?: string;
  /**
   * Optional nonce that will be embedded into the PKIdentityRequest. When provided,
   * it must be a base64-encoded byte string that the backend can include in the
   * session transcript to derive the decryption keys.
   */
  nonce?: string;
  // Additional fields may be added in future versions as APIs evolve.
	driversLicense?: {
		elements: UniqueArray<
			(IdentityElement | AgeAtLeastElement)[]
		>;
		intentToStore: IntentToStore;
	};
	nationalIDCard?: {
		elements: UniqueArray<(IdentityElement | AgeAtLeastElement)[]>;
		intentToStore: IntentToStore;
	};
	photoID?: {
		elements: UniqueArray<
			(IdentityElement | AgeAtLeastElement)[]
		>;
		intentToStore: IntentToStore;
	};
}

export type ExpoIdentityModuleEvents = {
	onIdentityReceived: (data: IdentityDocument) => void;
	onError: (error: { code: string; message: string }) => void;
};

// Props for the native Verify with Wallet button view
export type VerifyIdentityWithWalletButtonProps = {
	// Document type to probe for requestability and to decide whether to render the button
	documentKind?: IdentityDocument;
	label?: "continue" | "verify" | "verifyAge" | "verifyIdentity";
	buttonStyle?: "black" | "blackOutline";
	identityRequest?: IdentityDocumentRequest;
	// Optional compatibility props for web stub
	url?: string;
	onLoad?: (event: { nativeEvent: any }) => void;
	onButtonPress?: (event: { nativeEvent: any }) => void;
	onPress?: (event: { nativeEvent: any }) => void; // Alias for onButtonPress
	onAvailabilityChange?: (event: { nativeEvent: { available: boolean } }) => void;
	onCompletion?: (event: {
		nativeEvent: {
			ok: boolean;
			error?: string;
			code?: number;
			encryptedData?: string;
		};
	}) => void;
	style?: any;
	children?: React.ReactNode; // Fallback if unavailable
};
