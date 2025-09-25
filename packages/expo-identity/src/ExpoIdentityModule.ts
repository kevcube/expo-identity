import { NativeModule, requireNativeModule } from "expo";

import type {
  ExpoIdentityModuleEvents,
  IdentityDocumentRequest,
  IdentityDocument,
} from "./ExpoIdentity.types";

declare class ExpoIdentityNativeModule extends NativeModule<ExpoIdentityModuleEvents> {
  canRequestIdentityDocument(documentKind: IdentityDocument): Promise<boolean>;
  requestIdentityDocument(documentRequest: IdentityDocumentRequest): Promise<boolean>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<ExpoIdentityNativeModule>("ExpoIdentity");
