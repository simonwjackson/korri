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
- absence of a standalone `$out/bin/bazzar` binary

The existing closure guard still rejects shipped `node_modules` under `$out/share/korri-cli`.

## Quarantine posture

No private/local `.mjs` quarantine file is copied into Korri or referenced by the Nix package. Quarantined provider names are checked only as forbidden package/name patterns; this is not support for loading those providers.
