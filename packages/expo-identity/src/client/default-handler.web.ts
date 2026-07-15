import { IdentityClientException } from "./errors";
import {
  parseProtocolCredential,
  type IdentityHandler,
  type IdentityProtocol,
  type ProtocolRequest,
} from "../shared/protocol";

interface DigitalCredentialInstance extends Credential {
  protocol: string;
  data: unknown;
  toJSON?: () => unknown;
}

interface DigitalCredentialConstructor {
  new (): DigitalCredentialInstance;
  userAgentAllowsProtocol(protocol: string): Promise<boolean>;
}

const WEB_PROTOCOLS: IdentityProtocol[] = [
  "openid4vp-v1-signed",
  "openid4vp-v1-unsigned",
  "org-iso-mdoc",
];

type DigitalCredentialGet = (options: {
  mediation: "required";
  digital: { requests: ProtocolRequest[] };
}) => Promise<Credential | null>;

function browserApis(): {
  DigitalCredential: DigitalCredentialConstructor;
  get: DigitalCredentialGet;
} {
  const DigitalCredential = (
    globalThis as typeof globalThis & {
      DigitalCredential?: DigitalCredentialConstructor;
    }
  ).DigitalCredential;
  if (!globalThis.navigator?.credentials?.get || !DigitalCredential) {
    throw new IdentityClientException(
      "UNAVAILABLE",
      "This browser does not support Digital Credentials.",
    );
  }
  return {
    DigitalCredential,
    get: navigator.credentials.get.bind(
      navigator.credentials,
    ) as unknown as DigitalCredentialGet,
  };
}

function browserFailure(error: unknown): IdentityClientException {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "AbortError") {
      return new IdentityClientException(
        "CANCELLED",
        "Identity presentation was cancelled.",
      );
    }
    if (error.name === "SecurityError") {
      return new IdentityClientException(
        "INVALID_REQUEST",
        "The browser rejected the identity request for this origin.",
      );
    }
  }
  return new IdentityClientException(
    "UNAVAILABLE",
    "The browser could not present a digital credential.",
  );
}

export function webIdentity(): IdentityHandler {
  return {
    async capabilities() {
      const { DigitalCredential } = browserApis();
      const allowed = await Promise.all(
        WEB_PROTOCOLS.map((protocol) =>
          DigitalCredential.userAgentAllowsProtocol(protocol),
        ),
      );
      const protocols = WEB_PROTOCOLS.filter((_, index) => allowed[index]);
      if (protocols.length === 0) {
        throw new IdentityClientException(
          "UNAVAILABLE",
          "This browser does not allow a supported identity protocol.",
        );
      }
      return { protocols, origin: location.origin };
    },
    async present(request) {
      const { DigitalCredential, get } = browserApis();
      if (
        !(await DigitalCredential.userAgentAllowsProtocol(request.protocol))
      ) {
        throw new IdentityClientException(
          "UNAVAILABLE",
          `This browser does not allow ${request.protocol}.`,
        );
      }
      let credential: Credential | null;
      try {
        credential = await get({
          mediation: "required",
          digital: { requests: [request] },
        });
      } catch (error) {
        throw browserFailure(error);
      }
      if (!(credential instanceof DigitalCredential)) {
        throw new IdentityClientException(
          "INVALID_RESPONSE",
          "The browser did not return a digital credential.",
        );
      }
      const serialized = credential.toJSON
        ? credential.toJSON()
        : { protocol: credential.protocol, data: credential.data };
      try {
        const parsed = parseProtocolCredential(serialized);
        if (parsed.protocol !== request.protocol) {
          throw new TypeError("Credential does not match the request");
        }
        return parsed;
      } catch {
        throw new IdentityClientException(
          "INVALID_RESPONSE",
          "The browser returned a malformed digital credential.",
        );
      }
    },
  };
}

export default webIdentity();
