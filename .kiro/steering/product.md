# Product Overview

**expo-identity** is an Expo module that enables React Native applications to securely request and retrieve identity document information from Apple Wallet passes on iOS devices.

## Core Functionality

- **Identity Document Access**: Request specific identity elements from digital IDs stored in Apple Wallet
- **Privacy-First Design**: Users explicitly consent to share each piece of information
- **Age Verification**: Verify age thresholds without revealing exact date of birth
- **Secure Data Handling**: Uses Apple's PassKit framework for encrypted data transmission

## Supported Identity Elements

- Personal information (name, address, date of birth, age)
- Document details (number, issue/expiration dates, issuing authority)
- Portrait photo (returned as base64 JPEG)
- Age threshold verification (18+)

## Platform Support

- **Primary**: iOS 16.0+ (full functionality)
- **Secondary**: Android and Web (placeholder implementations)
- **Requirements**: Device must support digital IDs in Apple Wallet

## Target Use Cases

- Identity verification for apps requiring age verification
- KYC (Know Your Customer) processes
- Secure onboarding flows
- Document verification without manual data entry
