// Reexport the native module. On web, it will be resolved to ExpoIdentityModule.web.ts
// and on native platforms to ExpoIdentityModule.ts
// Re-export for convenience
import ExpoIdentityModule from "./ExpoIdentityModule";

export { default } from "./ExpoIdentityModule";
export * from "./ExpoIdentity.types";
export const canRequestIdentityDocument =
  ExpoIdentityModule.canRequestIdentityDocument;
export const requestIdentityDocument =
  ExpoIdentityModule.requestIdentityDocument;
