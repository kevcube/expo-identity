import { NativeModule, requireNativeModule } from "expo";

import type { IdentityCapabilities } from "./shared/protocol";

declare class ExpoIdentityNativeModule extends NativeModule {
  getCapabilities(): Promise<IdentityCapabilities>;
  present(requestJson: string): Promise<string>;
}

export default requireNativeModule<ExpoIdentityNativeModule>("ExpoIdentity");
