# Starter App

Clean React + Tailwind + TanStack Router starter with Effect RPC over Hono.

## Setup

```bash
bun install
```

## Development

```bash
just dev
```

`just dev` starts the web app, API, Playwright UI, and Storybook. Playwright UI is exposed over ephemeral HTTPS with Caddy. Ports can be overridden positionally or with environment variables:

```bash
just dev 7301 7302 7303 7304 zao
PORTAL_PORT=7301 API_PORT=7302 PW_PORT=7303 STORYBOOK_PORT=7304 APP_HOST=zao just dev
```

Useful commands:

```bash
just dev-web
just dev-api
just dev-playwright
just dev-storybook
just check
just test-unit
just test-e2e
just build
just format
just lint
just typecheck
just generate-gates
just generate-bdd
```

## Desktop

Electrobun desktop support is additive to the web/API stack. The desktop app builds the Vite portal assets, serves them from the Electrobun Bun main process alongside the existing Hono/Effect API, and opens the UI in a native window.

Useful desktop commands:

```bash
just desktop-runtime-check
just desktop-smoke
just desktop-dev
just desktop-build
```

`desktop-smoke`, `desktop-dev`, and `desktop-build` run the portal build first so `out/build/portal` exists. Desktop packaging is intentionally not part of `just build` or `just check` because Electrobun can download and execute platform-native binaries.

On NixOS, run `just desktop-runtime-check` before native launch or packaging. If Electrobun's downloaded Linux binary hits the NixOS dynamic linker stub, enable `nix-ld` for local development or add a wrapper/patchelf/Nix derivation before treating desktop packaging as supported on that machine.
