# expo-identity

An Expo module for Apple's **VerifyIdentityWithWallet** API - secure identity verification using digital IDs stored in Apple Wallet.

## Features

- **VerifyIdentityWithWallet button** - Native iOS 18+ button component
- **Flexible identity element requests** - Request any identity data elements
- **Age verification** - Including parameterized age thresholds (e.g., 21+)
- **Multiple document types** - Drivers license, state ID, national ID, photo ID
- **Privacy-first** - Uses Apple's secure PassKit framework with user consent

## Requirements

- **iOS 18.0+** for VerifyIdentityWithWallet API
- **iOS 16.5+** (iPhone 8+) or **iOS 17.5+** (iPhone XS+) depending on US state
- **Japan**: iPhone XS+ with iOS 18.5+
- Compatible identity document in Apple Wallet
- **Apple Developer Program** membership for entitlements

## Installation

```bash
npm install expo-identity
# or
yarn add expo-identity
```

## ⚠️ Required Configuration

### 1. **Entitlements File**

Create `[YourApp].entitlements` and add to your Xcode project:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>com.apple.developer.in-app-identity-presentment</key>
	<dict>
		<key>document-types</key>
		<array>
			<string>us-drivers-license</string>
			<string>us-state-id</string>
		</array>
		<key>elements</key>
		<array>
			<string>given-name</string>
			<string>family-name</string>
			<string>portrait</string>
			<string>address</string>
			<string>issuing-authority</string>
			<string>document-expiration-date</string>
			<string>document-number</string>
			<string>driving-privileges</string>
			<string>age</string>
			<string>date-of-birth</string>
		</array>
	</dict>
	<key>com.apple.developer.in-app-identity-presentment.merchant-identifiers</key>
	<array>
		<string>merchant.com.yourapp.youridentifier</string>
	</array>
</dict>
</plist>
```

**Important Notes:**
- **Document types**: Only include types your app will request (`us-drivers-license`, `us-state-id`)
- **Elements**: Only include data elements your app needs - Apple reviews these carefully
- **Merchant ID**: Must match your Apple Pay Merchant ID from Apple Developer portal

### 2. **Privacy Usage Description**

Add to your `Info.plist` (or app.json for Expo):

```xml
<key>NSIdentityUsageDescription</key>
<string>This app uses identity verification to verify your age and identity for secure access.</string>
```

### 3. **Apple Developer Setup**

1. **Create Merchant ID**: In Apple Developer portal, create an Apple Pay Merchant ID
2. **Request Entitlement**: Submit entitlement request to Apple with:
   - App details and use case
   - List of required document types
   - List of required data elements
   - Privacy policy URL
3. **Provisioning Profile**: Generate new profile including the identity entitlement
4. **Certificates**: Create "Identity Access Certificate" for your Merchant ID

### 4. **Xcode Project Settings**

- Set `CODE_SIGN_ENTITLEMENTS = YourApp/YourApp.entitlements` in build settings
- Ensure provisioning profile includes identity entitlement
- Verify merchant identifier matches exactly

## API

### `VerifyIdentityWithWalletButton`

The main component for identity verification. Renders Apple's native button and handles the verification flow.

```typescript
import { VerifyIdentityWithWalletButton } from 'expo-identity';
import type { IdentityDocumentRequest } from 'expo-identity';

const identityRequest: IdentityDocumentRequest = {
  merchantIdentifier: 'merchant.com.yourapp.youridentifier',
  driversLicense: {
    elements: ['givenName', 'familyName', 'age'],
    intentToStore: { intentToStore: 'willNotStore' },
  },
};

<VerifyIdentityWithWalletButton
  documentKind="driversLicense"
  label="verify"
  buttonStyle="black"
  identityRequest={identityRequest}
  onCompletion={(event) => {
    if (event.nativeEvent.ok) {
      console.log('Verification successful!');
    } else {
      console.error('Verification failed:', event.nativeEvent.error);
    }
  }}
/>
```

### Props

- **`documentKind`**: `"driversLicense" | "nationalIDCard" | "photoID"` - Type of document to verify
- **`label`**: `"continue" | "verify" | "verifyAge" | "verifyIdentity"` - Button label text
- **`buttonStyle`**: `"black" | "blackOutline"` - Button appearance style
- **`identityRequest`**: `IdentityDocumentRequest` - Configuration for what data to request
- **`onCompletion`**: Callback when verification completes (success or failure)
- **`onButtonPress`**: Callback when button is pressed
- **`onAvailabilityChange`**: Callback when button availability changes

### Identity Request Configuration

```typescript
interface IdentityDocumentRequest {
  merchantIdentifier?: string; // Required - your Apple Pay Merchant ID
  
  driversLicense?: {
    elements: (string | { type: "ageAtLeast", threshold: number })[];
    intentToStore: { intentToStore: "willNotStore" | "mayStore", days?: number };
  };
  
  nationalIDCard?: {
    elements: (string | { type: "ageAtLeast", threshold: number })[];
    intentToStore: { intentToStore: "willNotStore" | "mayStore", days?: number };
  };
  
  photoID?: {
    elements: (string | { type: "ageAtLeast", threshold: number })[];
    intentToStore: { intentToStore: "willNotStore" | "mayStore", days?: number };
  };
}
```

### Available Identity Elements

**Common Elements** (all document types):
- `"givenName"` - First/given name
- `"familyName"` - Last/family name  
- `"portrait"` - Photo from ID
- `"address"` - Full address
- `"documentNumber"` - ID document number
- `"dateOfBirth"` - Date of birth
- `"age"` - Current age
- `"sex"` - Gender (iOS 17.2+)

**Driver's License Specific**:
- `"issuingAuthority"` - DMV or issuing authority
- `"documentExpirationDate"` - License expiration
- `"documentIssueDate"` - License issue date  
- `"drivingPrivilege"` - Driving class/restrictions

**Age Threshold Element**:
```typescript
{ type: "ageAtLeast", threshold: 21 } // Verify user is 21+ without revealing exact age
```

### Module Functions

```typescript
import { canRequestIdentityDocument, requestIdentityDocument } from 'expo-identity';

// Check if specific document type is available
const canRequest = await canRequestIdentityDocument('driversLicense');

// Programmatic verification (alternative to button component)
const success = await requestIdentityDocument(identityRequest);
```

## Example

```typescript
import React, { useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { VerifyIdentityWithWalletButton } from 'expo-identity';
import type { IdentityDocumentRequest } from 'expo-identity';

export default function App() {
  const [verificationStatus, setVerificationStatus] = useState('Not verified');

  // Configure what identity data to request
  const identityRequest: IdentityDocumentRequest = {
    merchantIdentifier: 'merchant.com.yourapp.youridentifier', // Replace with your Merchant ID
    driversLicense: {
      elements: ['givenName', 'familyName', 'age'],
      intentToStore: { intentToStore: 'willNotStore' },
    },
  };

  // Age verification example (21+)
  const ageVerificationRequest: IdentityDocumentRequest = {
    merchantIdentifier: 'merchant.com.yourapp.youridentifier',
    driversLicense: {
      elements: [{ type: 'ageAtLeast', threshold: 21 }],
      intentToStore: { intentToStore: 'willNotStore' },
    },
  };

  const handleCompletion = (event: any) => {
    const { ok, error, code } = event.nativeEvent;
    
    if (ok) {
      setVerificationStatus('✅ Verification successful!');
      Alert.alert('Success', 'Identity verified successfully!');
    } else {
      setVerificationStatus(`❌ Verification failed: ${error}`);
      console.error(`Verification failed [${code}]:`, error);
    }
  };

  const handleButtonPress = (event: any) => {
    console.log('Verification button pressed');
    setVerificationStatus('🔄 Verification in progress...');
  };

  return (
    <View style={{ flex: 1, padding: 20, justifyContent: 'center' }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 30 }}>
        Identity Verification Demo
      </Text>

      <Text style={{ fontSize: 16, textAlign: 'center', marginBottom: 20 }}>
        Status: {verificationStatus}
      </Text>

      {/* Basic identity verification */}
      <Text style={{ fontWeight: 'bold', marginBottom: 10 }}>Basic Identity Verification:</Text>
      <VerifyIdentityWithWalletButton
        documentKind="driversLicense"
        label="verifyIdentity"
        buttonStyle="black"
        identityRequest={identityRequest}
        onButtonPress={handleButtonPress}
        onCompletion={handleCompletion}
        style={{ marginBottom: 30 }}
      />

      {/* Age verification (21+) */}
      <Text style={{ fontWeight: 'bold', marginBottom: 10 }}>Age Verification (21+):</Text>
      <VerifyIdentityWithWalletButton
        documentKind="driversLicense"
        label="verifyAge"
        buttonStyle="blackOutline"
        identityRequest={ageVerificationRequest}
        onButtonPress={handleButtonPress}
        onCompletion={handleCompletion}
      />
    </View>
  );
}
```

## Troubleshooting

### Common Error Codes

**PKIdentityErrorDomain Code 6 (PKIdentityErrorNotSupported)**
- ❌ **Cause**: Missing nonce in PKIdentityRequest *(fixed in this version)*
- ❌ **Cause**: Invalid or missing merchant identifier  
- ❌ **Cause**: Entitlement not approved by Apple
- ❌ **Cause**: Testing on unsupported iOS version
- ✅ **Solution**: Verify merchant ID matches entitlements exactly

**PKIdentityErrorDomain Code 4 (PKIdentityErrorNetworkUnavailable)**
- ❌ **Cause**: No internet connection
- ❌ **Cause**: Apple identity services unavailable
- ✅ **Solution**: Check network connectivity and try again

**Privacy Crash: NSIdentityUsageDescription**
- ❌ **Cause**: Missing privacy usage description
- ✅ **Solution**: Add NSIdentityUsageDescription to Info.plist

### Testing Tips

1. **Use Simulator**: iOS Simulator supports mock identity verification for testing
2. **Check Logs**: Enable console logging to see detailed error messages
3. **Verify Entitlements**: Build logs show applied entitlements - confirm they match your file
4. **Test Merchant ID**: Use your actual Apple Pay Merchant ID, not placeholder values

### Getting Apple Entitlement Approval

The `com.apple.developer.in-app-identity-presentment` entitlement requires Apple approval:

1. Submit detailed use case describing why you need identity verification
2. Specify exact document types and data elements required
3. Provide privacy policy URL explaining data usage
4. Apple reviews typically take 1-2 weeks
5. Only request elements you actually need - overly broad requests may be rejected

## Privacy and Security

This module uses Apple's PassKit framework which ensures:

- **User Consent**: Users must explicitly authorize each data sharing request
- **Minimal Data**: Only requested elements are shared, never the full document
- **Secure Transmission**: All data transmission is encrypted end-to-end
- **No Background Access**: App cannot access wallet without active user interaction
- **Device Authentication**: Requires Face ID/Touch ID for identity verification
- **Apple Verification**: All identity documents are cryptographically verified by Apple

## Supported Regions & Documents

### United States
- **Driver's License**: Most states (iOS 16.5+, iPhone 8+)
- **State ID Cards**: Supported in participating states
- **Requirements**: iPhone 8+ with iOS 16.5+ or iPhone XS+ with iOS 17.5+ (varies by state)

### Japan  
- **MyNumber Card**: iOS 18.5+, iPhone XS+
- **Elements**: Additional Japan-specific elements available

## License

MIT
