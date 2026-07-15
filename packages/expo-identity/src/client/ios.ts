import type { IdentityHandler } from "../shared/protocol";

export function iosIdentity(): IdentityHandler {
  // Defer the iOS-only module so tooling can inspect this subpath outside Expo.
  return {
    async capabilities() {
      const handler = (await import("./native-handler")).default;
      return handler.capabilities();
    },
    async present(request) {
      const handler = (await import("./native-handler")).default;
      return handler.present(request);
    },
  };
}
