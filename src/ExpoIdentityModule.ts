import { NativeModule, requireNativeModule } from "expo";

import type {
	ExpoIdentityModuleEvents,
} from "./ExpoIdentity.types";

declare class ExpoIdentityModule extends NativeModule<ExpoIdentityModuleEvents> {
	canRequestIdentityDocument(documentKind: string): Promise<boolean>;
	requestIdentityDocument(
		documentRequest: Record<string, string[]>,
		intentToStore: { type: string; days?: number },
	): Promise<boolean>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<ExpoIdentityModule>("ExpoIdentity");
