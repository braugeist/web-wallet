# Passkey Wallet

Passkey Wallet is a Vite + React app for experimenting with passkey-based wallet flows.

## Getting Started

1. Install dependencies with `npm install`.
2. Create a local env file with `cp .env.development.example .env.development`.
3. Start the app with `npm run dev`.

## Development Environment

`.env.development` is intentionally ignored by Git so local values stay on your machine. Commit changes to `.env.development.example` when the set of supported variables changes.

Current development env variables:

- `VITE_MOCK_PASSKEY=true` enables the mock passkey flow.
- `VITE_MOCK_PRIVATE_KEY=` is optional. Leave it blank to generate a random mock private key at startup.

When `VITE_MOCK_PRIVATE_KEY` is not set, the app prints a generated value to the browser console in a copy-pasteable format so it can be added back to `.env.development` and reused across restarts.

## Scripts

- `npm run dev` starts the Vite dev server.
- `npm run build` creates a production build.
- `npm run lint` runs ESLint.
- `npm run test` runs the test suite once.
