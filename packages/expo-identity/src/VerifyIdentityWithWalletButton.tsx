import { requireNativeView } from "expo";
import * as React from "react";
import { View, StyleSheet } from "react-native";

import type { VerifyIdentityWithWalletButtonProps } from "./ExpoIdentity.types";

// Only pass supported props to native. Map `onPress` to `onButtonPress`
type NativeProps = Omit<VerifyIdentityWithWalletButtonProps, "onPress">;

const NativeView: React.ComponentType<NativeProps> = requireNativeView("ExpoIdentity");

export default function VerifyIdentityWithWalletButton(props: VerifyIdentityWithWalletButtonProps) {
  const { onPress, onButtonPress, style, ...restProps } = props as any;

  const mergedOnButtonPress = React.useCallback(
    (event: any) => {
      if (typeof onButtonPress === "function") onButtonPress(event);
      if (typeof onPress === "function") onPress(event);
    },
    [onButtonPress, onPress]
  );

  return (
    <View style={[styles.container, style]}>
      <NativeView
        {...(restProps as NativeProps)}
        onButtonPress={mergedOnButtonPress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 44,
  },
});
