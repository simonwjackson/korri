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

## NixOS roles and product systems

Korri exposes three product-facing NixOS roles:

- `services.korri.server` — headless/control-plane server role.
- `services.korri.client` — GUI package/runtime role only; it does not own autostart or a compositor session.
- `services.korri.kiosk` — appliance session role that owns the Sway kiosk service, Korri client autostart, and input lifecycle coordination.

Lower-level `services.korri.inputd`, `services.korri.gameStream`, and legacy `services.korri.headlessSource` remain available for advanced composition. Baseline x86 product systems are exposed as `packages.x86_64-linux.korri-headless-system`, `packages.x86_64-linux.korri-kiosk-system`, and `packages.x86_64-linux.korri-kiosk-live-iso`; external platform adapters supply hardware quirks at the image boundary. Live USB validation surfaces are available as `checks.x86_64-linux.korri-live-usb-config`, `checks.x86_64-linux.korri-live-usb-vm-smoke`, and manual `nix run` apps such as `korri-live-usb-qemu`.
