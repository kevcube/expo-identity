// Reexport the native module. On web, it will be resolved to ExpoIdentityModule.web.ts
// and on native platforms to ExpoIdentityModule.ts
export { default } from './ExpoIdentityModule';
export { default as ExpoIdentityView } from './ExpoIdentityView';
export * from  './ExpoIdentity.types';
