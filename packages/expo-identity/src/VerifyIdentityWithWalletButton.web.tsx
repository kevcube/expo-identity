import type React from 'react';

import type { VerifyIdentityWithWalletButtonProps } from './ExpoIdentity.types';

export default function VerifyIdentityWithWalletButton(props: VerifyIdentityWithWalletButtonProps) {
  return (
    <div style={props.style as React.CSSProperties}>
      <iframe
        style={{ flex: 1 } as React.CSSProperties}
        src={props.url ?? "about:blank"}
        onLoad={() => props.onLoad?.({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
