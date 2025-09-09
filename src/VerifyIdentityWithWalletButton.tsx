import { requireNativeView } from "expo";
import type React from "react";

import type { VerifyIdentityWithWalletButtonProps } from "./ExpoIdentity.types";

const NativeView: React.ComponentType<VerifyIdentityWithWalletButtonProps> =
  requireNativeView("ExpoIdentity");

export default function VerifyIdentityWithWalletButton(props: VerifyIdentityWithWalletButtonProps) {
  return <NativeView {...props} />;
}
