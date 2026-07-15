import ExpoIdentityModule from "../ExpoIdentityModule";
import { IdentityClientException } from "./errors";
import {
  isIdentityProtocol,
  parseProtocolCredential,
  type IdentityHandler,
} from "../shared/protocol";

const nativeIdentity: IdentityHandler = {
  async capabilities() {
    const capabilities = await ExpoIdentityModule.getCapabilities();
    if (
      !Array.isArray(capabilities.protocols) ||
      !capabilities.protocols.every(isIdentityProtocol) ||
      (capabilities.origin !== undefined &&
        typeof capabilities.origin !== "string")
    ) {
      throw new IdentityClientException(
        "INVALID_RESPONSE",
        "The native identity module returned invalid capabilities.",
      );
    }
    return capabilities;
  },
  async present(request) {
    const responseJson = await ExpoIdentityModule.present(
      JSON.stringify(request),
    );
    try {
      const credential = parseProtocolCredential(JSON.parse(responseJson));
      if (credential.protocol !== request.protocol) {
        throw new TypeError("Credential protocol does not match the request");
      }
      return credential;
    } catch {
      throw new IdentityClientException(
        "INVALID_RESPONSE",
        "The native identity module returned an invalid credential.",
      );
    }
  },
};

export default nativeIdentity;
