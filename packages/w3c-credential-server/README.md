#w3c-credential-server

Helper utilities for working with responses produced by the browser
`navigator.credentials` workflow. Includes:

- `normaliseAssertion` to transform the browser payload into Node Buffers.
- `decryptCredentialEnvelope` for AES-GCM envelopes using base64url encoding.
- `generateRandomChallenge` for issuing new requests.
