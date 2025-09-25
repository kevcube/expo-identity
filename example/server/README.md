# Merchant Encryption Material

The `/verify` API decrypts `encryptedData` responses using the merchant's
HPKE key pair. Provide the private key and certificate that Verify with Wallet
is configured to use:

```
example/server/merchant_encryption.key
example/server/merchant_encryption.crt
```

In development you can reuse Apple's sample data from
`identity_verification_sample-2/sample/`. Point the app at a different
location by setting the `MERCHANT_ENCRYPTION_KEY_PATH` and
`MERCHANT_ENCRYPTION_CERT_PATH` environment variables before starting Expo.

The example app fetches a fresh nonce from the `/nonce` API before every
verification attempt. The `/verify` endpoint expects the same nonce alongside
the encrypted payload so it can rebuild the session transcript and decrypt the
response with the merchant key.
