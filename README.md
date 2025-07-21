# expo-identity

An Expo module for retrieving identity document details from Apple Wallet passes on iOS devices.

## Features

- Request and retrieve identity information from digital IDs stored in Apple Wallet
- Support for various identity elements including name, address, age, document details, and portrait
- Age verification without revealing exact date of birth
- Secure, privacy-preserving API using Apple's PassKit framework

## Requirements

- iOS 16.0 or later
- Device must support digital IDs in Apple Wallet
- User must have a compatible identity document added to their Apple Wallet

## Installation

```bash
npm install expo-identity
# or
yarn add expo-identity
```

## Configuration

### iOS

Add the following to your app's `Info.plist`:

```xml
<key>NSIdentityUsageDescription</key>
<string>This app needs to access your identity document to verify your information</string>
```

## API

### `isIdentityDocumentSupported()`

Check if the device supports identity document requests.

```typescript
import { isIdentityDocumentSupported } from "expo-identity";

const isSupported = await isIdentityDocumentSupported();
console.log("Identity documents supported:", isSupported);
```

### `requestIdentityDocument(elements)`

Request specific identity elements from the user's digital ID.

```typescript
import { requestIdentityDocument } from "expo-identity";

// Request basic information
const basicInfo = await requestIdentityDocument([
  "givenName",
  "familyName",
  "dateOfBirth",
]);

// Request full document information
const fullInfo = await requestIdentityDocument([
  "givenName",
  "familyName",
  "address",
  "dateOfBirth",
  "age",
  "documentNumber",
  "documentExpirationDate",
  "documentIssueDate",
  "issuingAuthority",
  "portrait",
]);

// Age verification (18+)
const ageVerification = await requestIdentityDocument(["ageThreshold"]);
```

### Available Identity Elements

- `name` - Both given and family name
- `givenName` - First/given name
- `familyName` - Last/family name
- `address` - Full address including street, city, postal code, etc.
- `dateOfBirth` - Date of birth
- `age` - Current age
- `ageThreshold` - Verify if user meets age threshold (18+)
- `documentNumber` - ID document number
- `documentExpirationDate` - Document expiration date
- `documentIssueDate` - Document issue date
- `issuingAuthority` - Authority that issued the document
- `portrait` - Photo from the ID (returned as base64 JPEG)

## Example

```typescript
import { useState } from 'react';
import { Button, View, Text, Image } from 'react-native';
import { isIdentityDocumentSupported, requestIdentityDocument } from 'expo-identity';

export default function App() {
  const [identityData, setIdentityData] = useState(null);

  const requestIdentity = async () => {
    try {
      const data = await requestIdentityDocument(['givenName', 'familyName', 'age', 'portrait']);
      setIdentityData(data);
    } catch (error) {
      console.error('Failed to request identity:', error);
    }
  };

  return (
    <View>
      <Button title="Request Identity" onPress={requestIdentity} />

      {identityData && (
        <View>
          <Text>Name: {identityData.givenName} {identityData.familyName}</Text>
          <Text>Age: {identityData.age}</Text>
          {identityData.portraitBase64 && (
            <Image
              source={{ uri: `data:image/jpeg;base64,${identityData.portraitBase64}` }}
              style={{ width: 100, height: 100 }}
            />
          )}
        </View>
      )}
    </View>
  );
}
```

## Privacy and Security

This module uses Apple's PassKit framework which ensures:

- Users must explicitly consent to share each piece of information
- Only the requested elements are shared
- The app cannot access the wallet or identity document without user interaction
- All data transmission is secure and encrypted

## License

MIT
