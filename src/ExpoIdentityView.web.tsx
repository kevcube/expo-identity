import * as React from 'react';

import { ExpoIdentityViewProps } from './ExpoIdentity.types';

export default function ExpoIdentityView(props: ExpoIdentityViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
