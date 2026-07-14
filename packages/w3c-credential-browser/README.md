# w3c-credential-browser

Utilities for invoking the W3C Credential Management API from the browser. The
main entry point `requestWebCredential` wraps `navigator.credentials.get`,
normalises ArrayBuffer responses into base64url strings, and provides a helper
to detect API availability.

```ts
import { requestWebCredential } from "w3c-credential-browser";

const credential = await requestWebCredential({
  challenge: "base64url-challenge",
  allowCredentials: [],
});
```
