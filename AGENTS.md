# Repository Guidelines

## Project Structure & Module Organization
- `src/`: TypeScript source of the Expo module (public API in `index.ts`, platform shims like `*.web.ts[x]`).
- `ios/`, `android/`: Native implementations for the module.
- `build/`: Compiled output (do not edit, git-ignored).
- `example/`: Minimal app to develop and manually test the module.

## Build, Test, and Development Commands
- `bun install` (or `npm i`): Install dependencies. Bun is preferred (`bun.lock` present).
- `bun run build` (or `npm run build`): Compile the module via `expo-module-scripts` into `build/`.
- `bun run lint`: Lint TypeScript/JS with Expo’s Universe rules.
- `bun run test`: Run module tests (Jest via `expo-module-scripts`).
- `cd example && bun run start` (or `npm run start`): Launch the example app; use `ios`, `android`, or `web` scripts as needed.

## Coding Style & Naming Conventions
- Indentation: 2 spaces; TypeScript for source.
- ESLint: extends `universe/native` and `universe/web`; fix warnings before pushing.
- Naming: PascalCase for components/types, camelCase for variables/functions, UPPER_SNAKE_CASE for constants.
- File patterns: platform files end with `*.ios.ts[x]`, `*.android.ts[x]`, or `*.web.ts[x]`.

## Testing Guidelines
- Framework: Jest via `expo-module-scripts`.
- Location: `src/__tests__` with filenames `*.test.ts[x]`.
- Scope: Unit-test public APIs and platform shims; include example-driven usage tests when helpful.
- Run locally: `bun run test` and ensure CI passes before opening a PR.

## Commit & Pull Request Guidelines
- Commits: Imperative present (“Add verify button”), small and focused; reference issues (`#123`) when relevant.
- Avoid “wip” commits; squash before merge if noisy.
- PRs: Include a clear description, test plan (commands, screenshots/logs), and note any API changes. Link related issues.

## Security & Configuration Tips
- iOS identity features require proper entitlements; configure in Xcode for the example app and document any new requirements in `README.md`.
- Do not commit secrets or signing files. Review diff for `build/` or lockfiles churn before submitting.
