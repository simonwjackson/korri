# Bazzar acquisition packaging and dependency audit

Date: 2026-06-04

## Summary

Task-007 packaging closure did not add new production package dependencies. The current acquisition migration slices compile against Korri's existing production dependency set (`effect`, `@effect/platform-bun`, `pino`, and existing platform/server/CLI dependencies). No Bazzar UI/demo API dependencies were imported. The production manifest renderer now preserves root `overrides` so Nix package installs keep the same `effect`/`ws` resolution as the checked-in Bun lock instead of trying to re-resolve older transitive specs during sandboxed builds.

## Dependency audit

No new `package.json` dependency was added for this slice, so no new vulnerability/capability review was required beyond confirming the production dependency filter still excludes known Bazzar-only/demo surfaces.

Forbidden production dependency checks now explicitly cover:

- `@trpc/*`
- `@fastify/*`
- `fastify`
- standalone/package identity string `bazzar`
- quarantined provider names: `coolrom`, `retrostic`, `romhustler`, `steamgriddb`, `wowroms`

## Packaging checks added

`product/apps/cli/package.nix` now smoke-tests the wrapped CLI for:

- existing `korri --version` startup
- new `korri bazzar --help` startup and visible migrated command names
- a safe `korri bazzar resolve-download packaging-smoke https://example.invalid/rom.zip --title Smoke` contract-command path that emits exactly one parseable JSON envelope line and exits with Bazzar caller-error code `21`
- absence of a standalone `$out/bin/bazzar` binary

The contract-command smoke uses an unknown-but-valid source name, so it exercises the bundled acquisition CLI envelope without performing network I/O or loading private quarantined `.mjs` plugins. The existing closure guard still rejects shipped `node_modules` under `$out/share/korri-cli`.

`nix build .#packages.x86_64-linux.korri-server --no-link` also passes for the server/API bundle. The server source closure now includes `product/apps/cli` because existing device and portal peer-discovery modules import the shared LAN stream discovery helper from that path; without that source path, the server build fails before it can verify the acquisition RPC import closure.

`tools/testing/nix/korri-package-outputs-check.nix` now forces both `korri-cli` and `korri-server` package outputs. That keeps the Bazzar CLI install check and server/API import closure in the Nix-owned package-output check tier instead of relying on TypeScript tests to inspect Nix derivation text.

## Quarantine posture

No private/local `.mjs` quarantine file is copied into Korri or referenced by the Nix package. Quarantined provider names are checked only as forbidden package/name patterns; this is not support for loading those providers.
