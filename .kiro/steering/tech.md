# Technology Stack

## Framework & Platform

- **Expo Module**: Built using Expo Module Scripts for cross-platform native module development
- **React Native**: 0.79.x with React 19.x
- **TypeScript**: Primary language for JavaScript/TypeScript code
- **Swift**: Native iOS implementation using PassKit framework

## Build System

- **expo-module-scripts**: Handles building, linting, testing, and publishing
- **Bun**: Package manager (bun.lock present)
- **Metro**: React Native bundler for example app

## Key Dependencies

- **expo**: ~53.0.x (peer dependency)
- **PassKit**: iOS framework for identity document access (iOS 16.0+)
- **ExpoModulesCore**: Swift framework for Expo module development

## Common Commands

### Development

```bash
# Build the module
npm run build

# Clean build artifacts
npm run clean

# Lint code
npm run lint

# Run tests
npm run test

# Prepare for publishing
npm run prepare
```

### Example App

```bash
# Start development server
cd example && npm start

# Run on iOS
npm run open:ios
cd example && npm run ios

# Run on Android
npm run open:android
cd example && npm run android
```

## Code Quality

- **Trunk**: Code formatting and linting tool configured
- **ESLint**: JavaScript/TypeScript linting
- **TypeScript**: Strict type checking enabled
- **Expo Module Scripts**: Handles build pipeline and quality checks

## Platform-Specific Notes

- iOS implementation requires Xcode and iOS 16.0+ simulator/device
- Android implementation is placeholder (not fully implemented)
- Web implementation provides fallback behavior
