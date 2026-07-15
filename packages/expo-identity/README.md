# expo-identity

Typed ISO mdoc presentation for Expo apps and WinterCG servers. The client asks the server to prepare a request, invokes the platform wallet with only that opaque request, and submits the opaque credential for server-side verification. Applications receive only the configured, server-verified claim aliases.

This release supports ISO mdoc. It does not support SD-JWT VC.

## Install

```sh
npm install expo-identity
```

The package exports:

- `expo-identity` and `expo-identity/client` for shared request types and the typed client
- `expo-identity/client/ios`, `/android`, and `/web` for explicit platform handlers
- `expo-identity/server` for the WinterCG server

There is no default native-module export or wallet button component.

## Before configuring Apple Wallet

Production Apple Wallet presentation requires material from several separate programs:

1. Obtain Apple Developer approval for the In-App Identity Presentment entitlement for the app ID and requested document types/elements.
2. In Identity Access, configure the merchant identifier and obtain the Apple identity encryption certificate and matching private key. The private key, team identifier, and certificate are server configuration, not app configuration.
3. Configure explicit issuer/IACA trust anchors. `issuance` roots validate document issuer chains; `status` roots validate status artifacts.
4. To support the web `org-iso-mdoc` protocol, obtain an Apple Business Connect reader-authentication certificate and matching private key.
5. To support signed OpenID4VP, provision a verifier signing certificate chain and matching private key. Supply any wallet-vendor metadata issued to the relying party, such as Google's `gw_rp_metadata_bytes`.

Never place encryption keys, signing keys, reader-authentication keys, team IDs, issuer roots, or server configuration in the Expo app.

## Configure the Expo app

Add the config plugin to `app.json`. These are entitlement declarations only:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-identity",
        {
          "ios": {
            "usageDescription": "Verify your identity using a document in Apple Wallet.",
            "merchantIdentifiers": ["merchant.com.example.identity"],
            "documentTypes": ["us-drivers-license"],
            "elements": ["age"]
          }
        }
      ]
    ]
  }
}
```

The plugin sets `NSIdentityUsageDescription`, `com.apple.developer.in-app-identity-presentment`, and `com.apple.developer.in-app-identity-presentment.merchant-identifiers`. Document and element arrays are deduplicated. Their open string types allow newly introduced or explicitly granted Apple entitlement values.

## Define requests and create the server

Request object keys are public, stable request names. Claim object keys are stable result aliases. The server derives platform-specific element requests, retention policy, and protocol data from this definition; the client sends only a request key.

```ts
// server/identity.ts
import {
  createMemoryTransactionStore,
  defineIdentityRequests,
  expoIdentity,
} from "expo-identity/server";

export const requests = defineIdentityRequests({
  ageOver21: {
    document: {
      doctype: "org.iso.18013.5.1.mDL",
      namespace: "org.iso.18013.5.1",
      apple: "driversLicense",
    },
    claims: {
      ageOver21: {
        type: "ageAtLeast",
        age: 21,
        retain: false,
      },
    },
  },
});

export const identity = expoIdentity({
  requests,
  apple: { mode: "simulator" },
  transactionStore: createMemoryTransactionStore(),
  onVerified: ({ identity }) => ({
    request: identity.request,
    assurance: identity.assurance,
    ageOver21: identity.document.claims.ageOver21,
  }),
});
```

`createMemoryTransactionStore()` is only for local development, tests, or one long-lived process. Production and serverless deployments must provide an `IdentityTransactionStore` backed by shared storage whose `take(id)` operation atomically reads and deletes the transaction. Every completion consumes its transaction before verification, whether verification succeeds or fails.

Production configuration uses deployment-secret bindings rather than app-bundled values:

```ts
const identity = expoIdentity({
  requests,
  trustedOrigins: [
    "https://app.example.com",
    "android:apk-key-hash:<unpadded-base64-sha256-signing-certificate>",
  ],
  transactionStore,
  transactionTTLSeconds: 300,
  trustAnchors: [
    {
      issuance: [issuerRootPem],
      status: [statusRootPem],
    },
  ],
  apple: {
    mode: "production",
    merchantIdentifier,
    teamIdentifier,
    encryptionCertificate: appleEncryptionCertificatePem,
    encryptionPrivateKey: appleEncryptionPrivateKeyPem,
  },
  openid4vp: {
    clientMetadata: {
      gw_rp_metadata_bytes: googleWalletRelyingPartyMetadata,
    },
    requestSigning: {
      certificateChain: [verifierCertificatePem],
      privateKey: verifierPrivateKeyPem,
    },
  },
  readerAuthentication: {
    certificateChain: [readerCertificatePem, readerIntermediatePem],
    privateKey: readerPrivateKeyPem,
  },
});
```

`trustedOrigins` entries are exact. It may instead be an async predicate for a controlled dynamic-origin deployment. Configuration is validated by `identity.ready()` and before requests are handled: certificates are parsed, each private key must match its public key, trust anchors are checked, and package-owned OpenID encryption/JWKS/format metadata cannot be overridden.

The server graph uses WinterCG APIs (`Request`, `Response`, WebCrypto, typed arrays, `atob`, and `btoa`) and does not require Node filesystem or `Buffer` APIs. Keep every certificate, private key, trust anchor, transaction, and callback side effect on this server boundary.

## Mount the Expo Router handler

Expose one catch-all API route:

```ts
// app/api/identity/[...all]+api.ts
import { identity } from "../../../server/identity";

export const POST = identity.handler;
export const OPTIONS = identity.handler;
```

The handler serves only `POST /api/identity/prepare`, `POST /api/identity/complete`, and preflight requests. Set `basePath` on both server and client if the default `/api/identity` is not appropriate.

## Create the typed client

Parameterizing the client with `typeof identity` constrains request keys and infers the callback output.

```ts
import { createIdentityClient } from "expo-identity";
import type { identity } from "./server/identity";

const identityClient = createIdentityClient<typeof identity>();
```

`baseURL`, `basePath`, `fetch`, and an explicit `handler` can be supplied when needed. The default handler is selected by the Expo platform. Explicit handlers are also available:

```ts
import { iosIdentity } from "expo-identity/client/ios";
import { androidIdentity } from "expo-identity/client/android";
import { webIdentity } from "expo-identity/client/web";
```

### Reliable web flow: `prepare()` then `present()`

Prepare before the user click. Call the prepared object's one-shot `present()` directly inside the click or press handler so browser transient user activation cannot expire during a network round trip:

```ts
const preparedResult = await identityClient.prepare({ request: "ageOver21" });

if (preparedResult.error) {
  renderError(preparedResult.error);
} else {
  verifyButton.onclick = async () => {
    const result = await preparedResult.data.present();
    if (result.error) {
      renderError(result.error);
      return;
    }

    const { request, assurance, ageOver21 } = result.data;
    renderVerifiedResult({ request, assurance, ageOver21 });
  };
}
```

A prepared request is consumed once, including cancellation and failure. Discard it and call `prepare()` again after every attempt.

### Convenience flow: `verify()`

`verify()` performs `prepare()` followed by `present()`. It is convenient when user-activation timing is not a concern:

```ts
const result = await identityClient.verify({ request: "ageOver21" });

if (result.error) {
  renderError(result.error);
} else {
  console.log(result.data.ageOver21); // boolean, inferred from the server callback
}
```

Expected cancellation, availability, network, expiry, HTTP, malformed-response, trust, and verification failures return `{ data: null, error }`; successful calls return `{ data, error: null }`. Stable error codes are:

- `UNAVAILABLE`
- `CANCELLED`
- `REQUEST_IN_PROGRESS`
- `INVALID_REQUEST`
- `NETWORK_ERROR`
- `EXPIRED`
- `INVALID_RESPONSE`
- `UNTRUSTED_ISSUER`
- `VERIFICATION_FAILED`
- `SERVER_ERROR`

Messages intentionally do not reveal unrequested credentials or claims held by the wallet.

## Platform support

| Platform | Minimum | Protocols and notes |
| --- | --- | --- |
| iOS | iOS 16.4 on iPhone or Simulator | Apple in-app Wallet presentation. National ID descriptors require iOS 18; photo ID descriptors require iOS 26. |
| Android | Android 9 / API 28 | AndroidX Credential Manager Digital Credentials; signed and unsigned OpenID4VP. |
| Safari | Safari 26 | `org-iso-mdoc` through the browser Digital Credentials API. |
| Chrome | Chrome 141 | Signed/unsigned OpenID4VP and `org-iso-mdoc`, subject to runtime protocol feature detection. |

Unsupported OS versions, document descriptors, entitlement values, wallet protocols, or unavailable credentials return `UNAVAILABLE`; requested elements are never silently dropped.

## Verification and assurance

Production verification requires the expected protocol transcript, nonce, origin or merchant binding, one configured document, the requested namespace and elements, a chain to an explicit issuance anchor, certificate validity/status, MSO signature and validity, every disclosed item digest, and the device signature. DeviceMAC, unexpected documents, duplicate elements, unrequested output aliases, malformed CBOR, and replayed transactions fail closed.

`assurance: "verified"` is returned only after those production checks. `{ apple: { mode: "simulator" } }` selects package-owned Apple Simulator material and emits `assurance: "simulator"`; Apple's published Simulator identity has zeroed issuer/device signatures and no issuer certificate. Simulator mode never falls back into production, and applications must not treat simulator assurance as production proof.

## Key rotation

Rotate without an untrusted gap:

1. Deploy overlapping old and new issuer/status trust anchors and any verifier or reader certificate chains.
2. Begin issuing/signing new requests with the new private material while accepting in-flight transactions created with the old material.
3. Wait beyond the maximum transaction and credential overlap period.
4. Retire the old trust, signing, encryption, and reader-authentication material.

Never replace production configuration with simulator material during rotation.
