import { requireNativeView } from "expo";
import * as React from "react";

import { ExpoIdentityViewProps } from "./ExpoIdentity.types";

const NativeView: React.ComponentType<ExpoIdentityViewProps> =
  requireNativeView("ExpoIdentity");

export default function ExpoIdentityView(props: ExpoIdentityViewProps) {
  return <NativeView {...props} />;
}
