import { IdentityClientException } from "./errors";
import type { IdentityHandler } from "../shared/protocol";

const unavailableHandler: IdentityHandler = {
  async capabilities() {
    throw new IdentityClientException(
      "UNAVAILABLE",
      "Digital identity presentation is unavailable on this platform.",
    );
  },
  async present() {
    throw new IdentityClientException(
      "UNAVAILABLE",
      "Digital identity presentation is unavailable on this platform.",
    );
  },
};

export default unavailableHandler;
