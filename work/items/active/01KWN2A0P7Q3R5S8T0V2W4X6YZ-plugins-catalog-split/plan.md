---
title: "refactor: make product/plugins a pure plugin catalog"
type: refactor
status: active
date: 2026-07-03
verify_command: "just typecheck && just test-unit"
---

# refactor: make product/plugins a pure plugin catalog

## Summary

Move every non-plugin file out of `product/plugins/` so the directory becomes a
clean catalog of plugin folders — as if it were a standalone plugins repository.
Host wiring (the first-party registry, acquisition adapter, and library-source
layer) moves to a new `product/services/server/plugins/` module; the shared
`community-source` authoring helper moves to `@platform/plugin`; and the two
plugins that currently live as loose `.ts` files (`itchio`, `acquisition-fixtures`)
become folders alongside the other plugins. No runtime behavior changes — this is
a pure relocation plus import repointing.

---

## Problem Frame

`product/plugins/` mixes two very different kinds of code: the plugin catalog
(one folder per plugin) and host-side glue that *consumes* the whole catalog
(registry aggregation, acquisition adapter, the `LibrarySource` Effect layer),
plus a shared plugin-authoring helper and a couple of plugins authored inline as
files rather than folders. That makes the boundary between "a plugin" and "the
host that loads plugins" invisible, and blocks reasoning about the catalog as an
independently ownable unit.

---

## Requirements

- R1. After this change, `product/plugins/` contains only plugin subdirectories — no top-level `.ts`/`.test.ts` files and no `AGENTS.md`-orphaned glue.
- R2. Host wiring (`index.ts`, `acquisition.ts`, `library-source-layer.ts` and their tests) lives under `product/services/server/plugins/`.
- R3. The shared `createCommunitySourcePlugin` helper lives at `@platform/plugin/community-source` and is consumed by the 13 community plugins from there.
- R4. `itchio` and `acquisition-fixtures` become plugin folders inside `product/plugins/`.
- R5. All consumers compile and pass: `just typecheck` and `just test-unit` are green, including the boundary guard tests under `tools/testing/standards/`.
- R6. No behavior change — plugin identities, provider ids, registry contents, and launch/acquisition/library-source outputs are unchanged.

---

## Scope Boundaries

- No change to any plugin's descriptor, id, provider id, handlers, or contributed config.
- No change to the public shape of `createFirstPartyPluginRegistryFromEnv`, `createFirstPartyAcquisitionPluginDefinitionsFromEnv`, or `PluginLibrarySourceLayerLive` — only their import path moves.
- Not extracting `product/plugins/` into an actual separate git repository — this is an in-repo relocation that makes that future move mechanical.
- Not rewriting `product/plugins/AGENTS.md` guidance beyond updating the "Registration" path reference.

### Deferred to Follow-Up Work

- Physically splitting `product/plugins/` into its own repo/package: separate initiative once the catalog/host boundary is clean.

---

## Context & Research

### Relevant Code and Patterns

- `product/plugins/index.ts` — first-party registry: `firstPartyPlugins`, `createFirstPartyPluginRegistryFromEnv`, launch integrations, daemon factories, session-lifecycle hooks. Imports every plugin folder relatively (`./retroarch`, …).
- `product/plugins/acquisition.ts` — `createFirstPartyAcquisitionPluginDefinitionsFromEnv`, imports `.` (registry).
- `product/plugins/library-source-layer.ts` — `PluginLibrarySourceLayerLive`, `createPluginResourceFulfillerFromEnv`; imports `.`, `./gmloader`, `./portmaster`.
- `product/plugins/community-source.ts` — `createCommunitySourcePlugin` + URL parsers; imported by 13 plugins via `../community-source`. Only depends on `@platform/*` + `effect`, so it can live under `@platform/plugin`.
- `product/plugins/itchio.ts` — real plugin; imports `../platform/acquisition/plugins/itchio`.
- `product/plugins/acquisition-fixtures.ts` — six bundled fixture plugins; imports only `@platform/*`.
- `product/services/server/` — existing server module (currently `http/`, `package.nix`); target home for host wiring.
- `product/platform/plugin/` — owns `@platform/plugin`; subpath modules (`registry.ts`, `session-lifecycle.ts`, `resources.ts`) are imported as `@platform/plugin/<name>`, matching how `community-source` will be consumed.

### Institutional Learnings

- Boundary guard `tools/testing/standards/surface-boundaries.test.ts` enforces the surface→services/apps/systems ban **only for web surfaces** (`product/surfaces/web`). The terminal surface `korri-cli` already imports `@product/services/device/*`, so consuming `@product/services/server/plugins` from `korri-cli` is consistent and not guard-violating.
- Boundary guard `tools/testing/standards/product-reorg-boundaries.test.ts` has `isInsideOwnedContentPlugin()` (line ~82) allowlisting `product/plugins/index.ts` / `index.test.ts` to reference plugin-owned content package names, plus `PLATFORM_PRIVATE_PRODUCT_IMPORT_ALLOWLIST` naming `product/platform/acquisition/acquisition-live.test.ts`. These must be updated when the registry file moves.

---

## Key Technical Decisions

- **Mirror the current filenames in the new host module.** Move `index.ts` → `product/services/server/plugins/index.ts`, `acquisition.ts` → `…/plugins/acquisition.ts`, `library-source-layer.ts` → `…/plugins/library-source-layer.ts`. This makes the alias remap a near-mechanical `@product/plugins` → `@product/services/server/plugins`, `@product/plugins/acquisition` → `@product/services/server/plugins/acquisition`, `@product/plugins/library-source-layer` → `@product/services/server/plugins/library-source-layer`.
- **Registry's per-plugin imports switch from relative to alias.** Inside the moved `index.ts` (and `library-source-layer.ts`), `./retroarch` etc. become `@product/plugins/retroarch`, since the file no longer sits inside `product/plugins/`.
- **`community-source.test.ts` travels with the registry, not the helper.** It is a registry-level composition test (imports the registry, the acquisition adapter, and ~15 plugin folders; it does not import the helper directly). It moves to `product/services/server/plugins/community-source.test.ts`. The helper itself has no dedicated unit test — the 13 consuming plugins cover it.
- **`community-source` consumed by subpath, not barrel.** Place at `product/platform/plugin/community-source.ts`, import as `@platform/plugin/community-source` (do not add to `@platform/plugin` index barrel), matching sibling modules.
- **`itchio` internal import uses the platform alias.** After becoming `itchio/index.ts`, its `../platform/acquisition/plugins/itchio` import becomes `@platform/acquisition/plugins/itchio`.

---

## Open Questions

### Resolved During Planning

- Where does host wiring go? → `product/services/server/plugins/` (user decision; consistent with korri-cli already importing `@product/services/device`).
- Where does `community-source` go? → `@platform/plugin/community-source` (user decision; legal since it only imports `@platform/*`).
- Do `itchio`/`acquisition-fixtures` become folders? → Yes (user decision).
- Does moving the registry out of `@product/plugins` break the alias? → The bare `@product/plugins` (→ `index.ts`) breaks and every bare importer must repoint; subpath imports like `@product/plugins/retroarch` keep working because the folders stay.

### Deferred to Implementation

- Exact final import-line formatting after Biome runs (`just format`) — mechanical.

---

## Output Structure

    product/
      plugins/                         # now: only plugin folders + AGENTS.md
        3dsen/ … zquest-classic/
        itchio/
          index.ts                     # was itchio.ts
        acquisition-fixtures/
          index.ts                     # was acquisition-fixtures.ts
        AGENTS.md
      services/server/plugins/         # new host-wiring module
        index.ts                       # was product/plugins/index.ts
        index.test.ts
        acquisition.ts
        acquisition.test.ts
        library-source-layer.ts
        library-source-layer.test.ts
        community-source.test.ts        # registry-level composition test
      platform/plugin/
        community-source.ts            # was product/plugins/community-source.ts

---

## Implementation Units

### U1. Convert `itchio` and `acquisition-fixtures` into plugin folders

**Goal:** Remove the two plugins-as-loose-files so the catalog is folder-uniform.

**Requirements:** R4, R6

**Dependencies:** None

**Files:**
- Create: `product/plugins/itchio/index.ts` (moved from `product/plugins/itchio.ts`)
- Create: `product/plugins/acquisition-fixtures/index.ts` (moved from `product/plugins/acquisition-fixtures.ts`)
- Delete: `product/plugins/itchio.ts`, `product/plugins/acquisition-fixtures.ts`
- Modify: `product/plugins/itchio/index.ts` — repoint `../platform/acquisition/plugins/itchio` → `@platform/acquisition/plugins/itchio`

**Approach:**
- `git mv` each file into a same-named folder as `index.ts`.
- `acquisition-fixtures/index.ts` imports only `@platform/*`, so no import edits beyond the move.
- Existing `./itchio` / `./acquisition-fixtures` imports in `product/plugins/index.ts` still resolve to the new folder's `index.ts` (they are repointed to aliases later in U3 regardless).

**Patterns to follow:**
- Any existing single-file plugin folder, e.g. `product/plugins/neverball/` (`index.ts` + `src/`).

**Test scenarios:**
- Test expectation: none — pure file relocation with no behavioral change; covered by existing `index.test.ts`/`acquisition.test.ts` registry assertions (which still enumerate the same plugin ids) run under `just test-unit`.

**Verification:**
- `just typecheck` resolves the new folder imports; the fixture/itchio provider ids still appear in the registry composition tests.

### U2. Relocate the `community-source` helper to `@platform/plugin`

**Goal:** Move the shared authoring helper out of the catalog into platform, and repoint its 13 consumers.

**Requirements:** R3, R6

**Dependencies:** None

**Files:**
- Create: `product/platform/plugin/community-source.ts` (moved from `product/plugins/community-source.ts`)
- Delete: `product/plugins/community-source.ts`
- Modify (repoint `../community-source` → `@platform/plugin/community-source`): `product/plugins/{xjlt,sonic-time-twisted,tiny-crate,mega-man-rock-n-roll,globeba,dome-romantik,stargrove-scramble,srb2kart,spelunky-classic-hd,shipwright,sonic-3-air,am2rlauncher,tmnt-rescue-palooza}/index.ts`

**Approach:**
- `git mv` the helper; it imports only `@platform/*` + `effect`, so no internal edits.
- Repoint the 13 plugin imports. Confirm the exact set with `grep -rl '"../community-source"' product/plugins`.
- Do not export it from the `@platform/plugin` index barrel — consume by subpath, like `@platform/plugin/registry`.

**Patterns to follow:**
- `@platform/plugin/session-lifecycle` and `@platform/plugin/resources` subpath modules.

**Test scenarios:**
- Test expectation: none — no dedicated helper unit test exists; the 13 consuming plugins' own `plugin.test.ts` files exercise the produced descriptors and run under `just test-unit`.

**Verification:**
- `just typecheck` green; the 13 community plugin tests still pass; no remaining `../community-source` references (`grep` returns empty).

### U3. Relocate host wiring to `product/services/server/plugins/` and repoint all consumers

**Goal:** Move the registry, acquisition adapter, and library-source layer (plus their tests) out of the catalog, rewrite their internal imports to aliases, and repoint every external consumer and boundary guard.

**Requirements:** R1, R2, R5, R6

**Dependencies:** U1 (registry references `itchio`/`acquisition-fixtures` as folders)

**Files:**
- Create (moved): `product/services/server/plugins/index.ts`, `acquisition.ts`, `library-source-layer.ts`, `index.test.ts`, `acquisition.test.ts`, `library-source-layer.test.ts`, `community-source.test.ts`
- Delete: `product/plugins/index.ts`, `acquisition.ts`, `library-source-layer.ts`, `index.test.ts`, `acquisition.test.ts`, `library-source-layer.test.ts`, `community-source.test.ts`
- Modify (internal imports in moved files): rewrite `./<plugin>` and `.` imports to `@product/plugins/<plugin>` / sibling `./acquisition` etc.
- Modify (external consumers — repoint `@product/plugins` → `@product/services/server/plugins`, and `/acquisition`, `/library-source-layer` subpaths):
  - `product/apps/portal/api/library/launch.rpc-handler.ts`
  - `product/apps/portal/api/server/status.rpc-handler.ts`
  - `product/apps/portal/api/server/rpc-server.ts`
  - `product/apps/portal/api/rpc-server.ts`
  - `product/apps/portal/api/plugins/fulfill-resource.rpc-handler.ts`
  - `product/apps/portal/api/plugin-diagnostics/collect.rpc-handler.ts`
  - `product/apps/portal/api/plugin-lifecycle/collect.rpc-handler.ts`
  - `product/apps/portal/api/plugin-install/request.rpc-handler.ts`
  - `product/apps/portal/api/plugin-install/status.rpc-handler.ts`
  - `product/apps/portal/stream/moonlight-launcher.ts`
  - `product/services/device/sessiond-plugin-composition.ts`
  - `product/services/device/game-stream-runner.ts`
  - `product/services/device/korrid.ts`
  - `product/surfaces/terminal/korri-cli/korri-cli.ts`
  - `product/surfaces/terminal/korri-cli/scout-command.ts`
  - `tools/library/launcher-config-cli.ts`
  - `product/platform/library/discovery/release-candidate-scan.test.ts`
  - `product/platform/acquisition/acquisition-live.test.ts`
  - Plugin tests reaching the registry relatively: `product/plugins/steam/src/plugin.test.ts` (`../..`), `product/plugins/remap/plugin.test.ts` (`..`) → `@product/services/server/plugins`
- Modify (boundary guards): `tools/testing/standards/product-reorg-boundaries.test.ts` — update `isInsideOwnedContentPlugin()` regex to point at `product/services/server/plugins/index.ts`/`index.test.ts`, and any allowlist entries referencing the moved acquisition/registry import specifiers
- Modify (docs): `product/plugins/AGENTS.md` "Registration" section — update the `product/plugins/index.ts` reference to the new path

**Approach:**
- This is one atomic unit: the tree cannot be green with `index.ts` moved but consumers still pointing at `@product/plugins`. Move files, rewrite internal imports to `@product/plugins/*` aliases, repoint all consumers, and update the guard in the same commit.
- Enumerate consumers precisely before editing: `grep -rn 'from "\(@product/plugins\|.*/plugins\)"' ` and the `/acquisition` / `/library-source-layer` subpaths across `product`, `tools`, `packages`.
- After moving, re-run the guard test explicitly to confirm the allowlist edits are correct.

**Execution note:** Characterization-first — before editing, capture the current `just test-unit` pass state (esp. `index.test.ts`, `community-source.test.ts`, `product-reorg-boundaries.test.ts`) as the green baseline this move must preserve.

**Patterns to follow:**
- Existing `@product/services/device/*` consumption from `korri-cli` for the surface→services import shape.

**Test scenarios:**
- Integration: `createFirstPartyPluginRegistryFromEnv()` from the new path yields the identical enabled-plugin set as before (existing `index.test.ts` assertions, relocated).
- Integration: `createFirstPartyAcquisitionPluginDefinitionsFromEnv()` still gates fixture/pico8/etc. providers by `KORRI_ENABLED_PLUGINS` (relocated `acquisition.test.ts`).
- Integration: `PluginLibrarySourceLayerLive` still exposes enabled plugins (Neverball, gmloader, portmaster) through the live library source (relocated `library-source-layer.test.ts`).
- Boundary: `product-reorg-boundaries.test.ts` passes with the updated allowlist (owned-content-name references now legal at the new registry path).

**Verification:**
- `just typecheck`, `just test-unit`, `just lint`, `just format` all green.
- `product/plugins/` top level contains only plugin folders + `AGENTS.md` (`ls product/plugins` shows no stray `.ts`).
- No remaining references to `@product/plugins` bare or `product/plugins/{index,acquisition,library-source-layer,community-source}` outside the new locations (`grep` returns empty).

---

## System-Wide Impact

- **Interaction graph:** The registry is consumed by portal API RPC handlers, the device services (`korrid`, `game-stream-runner`, `sessiond-plugin-composition`), the terminal CLI, and `tools/library`. All are import-path-only edits; runtime wiring is unchanged.
- **API surface parity:** `@product/plugins/acquisition` and `@product/plugins/library-source-layer` subpath consumers must move in lockstep with the bare-alias consumers.
- **State lifecycle risks:** None — no state, storage, or ordering changes; purely module location.
- **Unchanged invariants:** Plugin descriptors, ids, provider ids, registry contents, acquisition definitions, and `LibrarySource` outputs are all unchanged. Subpath imports into individual plugin folders (`@product/plugins/retroarch`, used by platform tests) remain valid.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Missed consumer of bare `@product/plugins` leaves a dangling import | Whole-repo `just typecheck` (path aliases require it) plus an explicit post-move `grep` for the old specifiers. |
| Boundary guard `product-reorg-boundaries.test.ts` fails because the registry (which references owned-content package names) moved | Update `isInsideOwnedContentPlugin()` and allowlist entries in the same unit; re-run that test directly. |
| Surface boundary concern for `korri-cli` importing services | Enforced guard covers only web surfaces; terminal already imports `@product/services/device`, so this is consistent and un-guarded. |
| Registry internal imports break after leaving `product/plugins/` | Rewrite `./<plugin>` → `@product/plugins/<plugin>` during the move; typecheck catches any misses. |

---

## Sources & References

- Registry: `product/plugins/index.ts`
- Acquisition adapter: `product/plugins/acquisition.ts`
- Library source layer: `product/plugins/library-source-layer.ts`
- Community-source helper: `product/plugins/community-source.ts`
- Boundary guards: `tools/testing/standards/surface-boundaries.test.ts`, `tools/testing/standards/product-reorg-boundaries.test.ts`
- Authoring guide: `product/plugins/AGENTS.md`
