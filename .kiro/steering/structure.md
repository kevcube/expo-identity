# Project Structure

## Root Level Organization

```
expo-identity/
├── src/                    # TypeScript source code
├── ios/                    # iOS native implementation
├── android/                # Android native implementation
├── example/                # Example React Native app
├── build/                  # Compiled output (generated)
└── node_modules/           # Dependencies (generated)
```

## Source Code (`src/`)

- **index.ts**: Main entry point, re-exports module functions
- **ExpoIdentityModule.ts**: Native module interface and type declarations
- **ExpoIdentityModule.web.ts**: Web platform implementation (fallback)
- **ExpoIdentity.types.ts**: TypeScript type definitions
- **ExpoIdentityView.tsx**: React component (if needed)
- **ExpoIdentityView.web.tsx**: Web-specific React component

## iOS Implementation (`ios/`)

- **ExpoIdentityModule.swift**: Main Swift module using PassKit framework
- **ExpoIdentityView.swift**: Swift UI component implementation
- **ExpoIdentity.podspec**: CocoaPods specification

## Android Implementation (`android/`)

- **build.gradle**: Android build configuration
- **src/main/**: Java/Kotlin source code and Android manifest
- **AndroidManifest.xml**: Android permissions and configuration

## Example App (`example/`)

- **App.tsx**: Main example application demonstrating module usage
- **package.json**: Example app dependencies and scripts
- **ios/**: iOS-specific example app configuration
- **android/**: Android-specific example app configuration

## Configuration Files

- **expo-module.config.json**: Expo module platform configuration
- **package.json**: Module metadata, dependencies, and npm scripts
- **tsconfig.json**: TypeScript compilation settings
- **.eslintrc.js**: ESLint configuration
- **bun.lock**: Dependency lock file

## Code Organization Patterns

### TypeScript Modules

- Use named exports for functions: `export const functionName`
- Re-export from index.ts for clean public API
- Separate types into dedicated `.types.ts` files
- Platform-specific implementations use `.web.ts` suffix

### Swift Implementation

- Use `@available(iOS 16.0, *)` for iOS version checks
- Implement `Module` protocol from ExpoModulesCore
- Define async functions with Promise parameters
- Handle errors with promise rejection

### Naming Conventions

- **Files**: PascalCase for components, camelCase for utilities
- **Functions**: camelCase (isIdentityDocumentSupported, requestIdentityDocument)
- **Types**: PascalCase interfaces and type aliases
- **Constants**: UPPER_SNAKE_CASE for static values
