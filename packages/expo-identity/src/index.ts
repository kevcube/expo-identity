// Reexport the native module. On web, it will be resolved to ExpoIdentityModule.web.ts
// and on native platforms to ExpoIdentityModule.ts
// Re-export for convenience
import ExpoIdentityModule from "./ExpoIdentityModule";
import type { IdentityDocumentRequest } from "./ExpoIdentity.types";

export { default } from "./ExpoIdentityModule";
export * from "./ExpoIdentity.types";
export { default as VerifyIdentityWithWalletButton } from "./VerifyIdentityWithWalletButton";

// Low-level exports
export const canRequestIdentityDocument = ExpoIdentityModule.canRequestIdentityDocument;
export const requestIdentityDocument = (request: IdentityDocumentRequest) =>
  ExpoIdentityModule.requestIdentityDocument(request);

// Backwards-compatible helper used by the example
// Simulator tip: Photo ID is typically the only type available in Simulator.
export const isIdentityDocumentSupported = () =>
  ExpoIdentityModule.canRequestIdentityDocument("photoID");
