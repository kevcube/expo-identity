import type { IdentityHandler } from "../shared/protocol";

export function androidIdentity(): IdentityHandler {
  // Defer the Android-only module so tooling can inspect this subpath outside Expo.
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
