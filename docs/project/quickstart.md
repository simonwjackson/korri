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

On NixOS, run desktop commands inside `nix develop`. `just desktop-runtime-check` self-heals Electrobun's downloaded Linux binary by patching it with the dev shell's dynamic linker before re-probing. `nix-ld` is only a fallback if in-flake patching is unavailable.

Remote Linux users can run the desktop app directly with Nix:

```bash
nix run github:<acct>/<repo>
nix run github:<acct>/<repo>#korri-desktop
```

The first run downloads the Nix GTK/WebKit runtime closure, so it can be large. Current `nix run` support targets `x86_64-linux` and `aarch64-linux`.

## NixOS roles and product systems

Korri exposes three product-facing NixOS roles:

- `services.korri.server` — headless/control-plane server role.
- `services.korri.client` — GUI package/runtime role only; it does not own autostart or a compositor session.
- `services.korri.kiosk` — appliance session role that owns the Sway kiosk service, Korri client autostart, and input lifecycle coordination.

Lower-level `services.korri.inputd`, `services.korri.gameStream`, and legacy `services.korri.headlessSource` remain available for advanced composition. Baseline x86 product systems are exposed as `packages.x86_64-linux.korri-headless-system`, `packages.x86_64-linux.korri-kiosk-system`, and `packages.x86_64-linux.korri-kiosk-live-iso`; external platform adapters supply hardware quirks at the image boundary. Live USB validation surfaces are available as `checks.x86_64-linux.korri-live-usb-config`, `checks.x86_64-linux.korri-live-usb-vm-smoke`, and manual `nix run` apps such as `korri-live-usb-qemu`.
