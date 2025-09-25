import { requireNativeView } from "expo";
import * as React from "react";

import type { VerifyIdentityWithWalletButtonProps } from "./ExpoIdentity.types";

// Only pass supported props to native. Map `onPress` to `onButtonPress`
type NativeProps = Omit<VerifyIdentityWithWalletButtonProps, "onPress">;

const NativeView: React.ComponentType<NativeProps> = requireNativeView("ExpoIdentity");

export default function VerifyIdentityWithWalletButton(props: VerifyIdentityWithWalletButtonProps) {
  const { onPress, onButtonPress, ...rest } = props as any;
  const mergedOnButtonPress = React.useCallback(
    (event: any) => {
      if (typeof onButtonPress === "function") onButtonPress(event);
      if (typeof onPress === "function") onPress(event);
    },
    [onButtonPress, onPress]
  );

  const style = (rest as any).style;
  return (
    <NativeView
      {...(rest as NativeProps)}
      // Ensure a visible touch target even without explicit styles
      style={[{ minHeight: 44 }, style]}
      onButtonPress={mergedOnButtonPress}
    />
  );
}
