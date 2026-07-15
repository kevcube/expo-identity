export type AppleDocumentKind = "driversLicense" | "nationalIDCard" | "photoID";

export type AppleIdentityElement =
  | "name"
  | "givenName"
  | "familyName"
  | "portrait"
  | "address"
  | "documentNumber"
  | "dateOfBirth"
  | "age"
  | "sex"
  | "issuingAuthority"
  | "documentExpirationDate"
  | "documentIssueDate"
  | "drivingPrivileges"
  | "eyeColor"
  | "hairColor"
  | "height"
  | "weight"
  | "organDonorStatus"
  | "veteranStatus"
  | "documentDHSComplianceStatus"
  | "nationality"
  | "placeOfBirth"
  | "signatureUsualMark"
  | "dhsTemporaryLawfulStatus";

export type RetentionPolicy =
  { retain: false } | { retain: true; retentionDays: number };

export type IdentityClaim = (
  | { type: AppleIdentityElement }
  | { type: "ageAtLeast"; age: number }
  | {
      type: "custom";
      namespace: string;
      identifier: string;
      appleElement?: AppleIdentityElement;
    }
) &
  RetentionPolicy;

export type IdentityRequestDefinition = {
  document: {
    doctype: string;
    namespace: string;
    apple?: AppleDocumentKind;
  };
  claims: Record<string, IdentityClaim>;
};

export type IdentityRequestDefinitions = Record<
  string,
  IdentityRequestDefinition
>;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type IdentityByteValue = { base64url: string; mediaType?: string };

export type IdentityClaimOutput<TClaim extends IdentityClaim> = TClaim extends {
  type: "ageAtLeast";
}
  ? boolean
  : TClaim extends { type: "age" }
    ? number
    : TClaim extends { type: "portrait" }
      ? IdentityByteValue
      : TClaim extends { type: "custom" }
        ? JsonValue | IdentityByteValue
        : JsonValue | IdentityByteValue;

export type IdentityRequestClaims<TRequest extends IdentityRequestDefinition> =
  {
    [K in keyof TRequest["claims"]]: IdentityClaimOutput<TRequest["claims"][K]>;
  };

export type IdentityAssurance = "verified" | "simulator";

export type VerifiedIdentity<
  TRequestKey extends string = string,
  TRequest extends IdentityRequestDefinition = IdentityRequestDefinition,
> = {
  request: TRequestKey;
  assurance: IdentityAssurance;
  document: {
    doctype: TRequest["document"]["doctype"];
    claims: IdentityRequestClaims<TRequest>;
  };
};

export type ResolvedIdentityClaim = {
  namespace: string;
  identifier: string;
  retain: boolean;
  retentionDays?: number;
  appleElement?: AppleIdentityElement | { ageAtLeast: number };
};

const AAMVA_NAMESPACE = "org.iso.18013.5.1.aamva";

const ISO_IDENTIFIERS: Record<AppleIdentityElement, string> = {
  name: "name",
  givenName: "given_name",
  familyName: "family_name",
  portrait: "portrait",
  address: "resident_address",
  documentNumber: "document_number",
  dateOfBirth: "birth_date",
  age: "age_in_years",
  sex: "sex",
  issuingAuthority: "issuing_authority",
  documentExpirationDate: "expiry_date",
  documentIssueDate: "issue_date",
  drivingPrivileges: "driving_privileges",
  eyeColor: "eye_colour",
  hairColor: "hair_colour",
  height: "height",
  weight: "weight",
  organDonorStatus: "organ_donor",
  veteranStatus: "veteran",
  documentDHSComplianceStatus: "DHS_compliance",
  nationality: "nationality",
  placeOfBirth: "birth_place",
  signatureUsualMark: "signature_usual_mark",
  dhsTemporaryLawfulStatus: "DHS_temporary_lawful_status",
};

const AAMVA_ELEMENTS: Partial<Record<AppleIdentityElement, true>> = {
  organDonorStatus: true,
  veteranStatus: true,
  documentDHSComplianceStatus: true,
  dhsTemporaryLawfulStatus: true,
};

const APPLE_DOCUMENT_KINDS: Record<AppleDocumentKind, true> = {
  driversLicense: true,
  nationalIDCard: true,
  photoID: true,
};

function requireNonempty(
  value: unknown,
  path: string,
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${path} must be a nonempty string`);
  }
}

export function validateIdentityRequests(
  requests: IdentityRequestDefinitions,
): void {
  if (!requests || typeof requests !== "object" || Array.isArray(requests)) {
    throw new TypeError("requests must be an object");
  }

  for (const [requestKey, request] of Object.entries(requests)) {
    requireNonempty(requestKey, "request key");
    if (!request || typeof request !== "object" || Array.isArray(request)) {
      throw new TypeError(`requests.${requestKey} must be an object`);
    }

    requireNonempty(
      request.document?.doctype,
      `requests.${requestKey}.document.doctype`,
    );
    requireNonempty(
      request.document?.namespace,
      `requests.${requestKey}.document.namespace`,
    );
    if (
      request.document.apple !== undefined &&
      !APPLE_DOCUMENT_KINDS[request.document.apple]
    ) {
      throw new TypeError(`requests.${requestKey}.document.apple is invalid`);
    }
    if (
      !request.claims ||
      typeof request.claims !== "object" ||
      Array.isArray(request.claims)
    ) {
      throw new TypeError(`requests.${requestKey}.claims must be an object`);
    }

    for (const [alias, claim] of Object.entries(request.claims)) {
      requireNonempty(alias, `requests.${requestKey} claim alias`);
      const path = `requests.${requestKey}.claims.${alias}`;
      if (!claim || typeof claim !== "object" || Array.isArray(claim)) {
        throw new TypeError(`${path} must be an object`);
      }

      if (claim.retain === true) {
        if (
          !Number.isInteger(claim.retentionDays) ||
          claim.retentionDays <= 0
        ) {
          throw new TypeError(
            `${path}.retentionDays must be a positive integer`,
          );
        }
      } else if (claim.retain === false) {
        if ("retentionDays" in claim) {
          throw new TypeError(
            `${path}.retentionDays is allowed only when retain is true`,
          );
        }
      } else {
        throw new TypeError(`${path}.retain must be a boolean`);
      }

      if (claim.type === "ageAtLeast") {
        if (!Number.isInteger(claim.age) || claim.age < 0 || claim.age > 150) {
          throw new TypeError(
            `${path}.age must be an integer from 0 through 150`,
          );
        }
      } else if (claim.type === "custom") {
        requireNonempty(claim.namespace, `${path}.namespace`);
        requireNonempty(claim.identifier, `${path}.identifier`);
        if (request.document.apple && !claim.appleElement) {
          throw new TypeError(
            `${path}.appleElement is required for Apple identity requests`,
          );
        }
        if (
          claim.appleElement !== undefined &&
          !(claim.appleElement in ISO_IDENTIFIERS)
        ) {
          throw new TypeError(`${path}.appleElement is invalid`);
        }
      } else if (!(claim.type in ISO_IDENTIFIERS)) {
        throw new TypeError(`${path}.type is invalid`);
      }
    }
  }
}

export function resolveIdentityClaim(
  request: IdentityRequestDefinition,
  claim: IdentityClaim,
): ResolvedIdentityClaim {
  const retention = claim.retain
    ? { retain: true, retentionDays: claim.retentionDays }
    : { retain: false };

  if (claim.type === "custom") {
    return {
      namespace: claim.namespace,
      identifier: claim.identifier,
      appleElement: claim.appleElement,
      ...retention,
    };
  }
  if (claim.type === "ageAtLeast") {
    return {
      namespace: request.document.namespace,
      identifier: `age_over_${claim.age}`,
      appleElement: { ageAtLeast: claim.age },
      ...retention,
    };
  }

  return {
    namespace: AAMVA_ELEMENTS[claim.type]
      ? AAMVA_NAMESPACE
      : request.document.namespace,
    identifier: ISO_IDENTIFIERS[claim.type],
    appleElement: claim.type,
    ...retention,
  };
}

export function defineIdentityRequests<
  const T extends Record<string, IdentityRequestDefinition>,
>(requests: T): T {
  validateIdentityRequests(requests);
  return requests;
}
