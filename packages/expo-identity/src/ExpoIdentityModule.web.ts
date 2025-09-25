import { NativeModule, registerWebModule } from "expo";

import type {
	ExpoIdentityModuleEvents,
	IdentityDocument,
} from "./ExpoIdentity.types";

class ExpoIdentityModule extends NativeModule<ExpoIdentityModuleEvents> {
	PI = Math.PI;
	async setValueAsync(value: IdentityDocument): Promise<void> {
		this.emit("onIdentityReceived", value);
	}
	hello() {
		return "Hello world! 👋";
	}
}

export default registerWebModule(ExpoIdentityModule, "ExpoIdentityModule");
