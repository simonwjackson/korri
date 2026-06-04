# Effect-family upgrade prerequisite audit

Date: 2026-06-04

## Scope

PR-0 for the Bazzar migration plan upgrades the repo's Effect-family packages before any acquisition code is introduced:

- `effect`: `4.0.0-beta.60` → `4.0.0-beta.78`
- `@effect/platform-bun`: `4.0.0-beta.60` → `4.0.0-beta.78`
- `@effect/atom-react`: `4.0.0-beta.60` → `4.0.0-beta.78`

`package.json` also pins `overrides.effect` at `4.0.0-beta.78` so packages such as `@proseql/core` compile against the same Effect Schema/AST types as the rest of Korri. It also pins `overrides.ws` at `8.21.0` because the upgraded `@effect/platform-node-shared` range otherwise resolved to `ws@8.20.0`, which `bun audit` flags for GHSA-58qx-3vcg-4xpx.

## Validation

Passed after the upgrade:

- `just validate-router`
- `just typecheck`
- `just check-bun-deps`
- `just lint`
- `bun test product/platform/library/config/records/game-asset.test.ts product/apps/portal/api/server/rpc-server.test.ts product/apps/portal/api/source/list.rpc-handler.test.ts`

`just test-unit` was run after the final dependency override state. It passed 2113 tests, including the Effect/RPC/library areas exercised by the upgrade, but the full suite still has unrelated existing failures captured separately in backlog item `task-009`:

- `tools/testing/standards/test-suite-partitioning.test.ts` expects `tools/testing/nix` to be absent even though it is tracked.
- `tools/feature-map-explorer/src/components/editor/markdown/markdownSerializer.test.ts` references missing `docs/jobs/safe-game-resume.md`.

## Vulnerability/capability audit

`bun audit` was run after the upgrade. Before the `ws` override, it reported GHSA-58qx-3vcg-4xpx through the upgraded Effect platform path. After adding `overrides.ws = 8.21.0`, the Effect platform `ws` advisory no longer appears. The audit still reports existing project advisories in unrelated direct/dev/transitive packages, including `happy-dom`, `hono`, `protobufjs`, `brace-expansion`, `@babel/plugin-transform-modules-systemjs`, and `uuid` paths.

Effect-upgrade-specific note:

- `@effect/platform-bun@4.0.0-beta.78` depends on `@effect/platform-node-shared@4.0.0-beta.78`, which depends on `ws` via `^8.20.0`. `package.json` overrides `ws` to `8.21.0` so the Effect platform path does not ship the vulnerable `8.20.0` resolution.
- `effect@4.0.0-beta.78` now depends on newer parsing/serialization transitive packages (`fast-check`, `ini`, `msgpackr`, `uuid`, `yaml`) as reflected in `bun.lock` and regenerated Nix dependency files.

No Bazzar acquisition code, Bazzar UI/API dependencies, or `.mjs` plugin paths are introduced by this prerequisite.
