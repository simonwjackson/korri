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
