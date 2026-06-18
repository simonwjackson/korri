# Temporary handoff: make `@korri:gamescope` a plugin-declared launch companion

## Goal

Move one step closer to the launch-composition/plugin design by making the authored key:

```yaml
launch:
  with:
    "@korri:gamescope":
      enable: true
```

backed by a first-party plugin contribution instead of remaining only a hardcoded config/resolver convention.

The desired end state for this slice:

> `@korri:gamescope` is a registered first-party plugin that declares a launch companion/wrapper capability. The config/resolver may still normalize to internal `context.gamescope` temporarily, but the identity and contribution come from the plugin model.

## Current state

Recent local work already moved authored Gamescope config to the launch companion shape:

```yaml
launch:
  with:
    "@korri:gamescope": <GamescopePolicy>
```

and intentionally removed backwards compatibility for top-level authored:

```yaml
gamescope: <GamescopePolicy>
```

Relevant recent commits on `trunk`:

- `0f92cc3 feat(config): move gamescope policy under launch companions`
- `620993c fix(config): close gamescope companion review gaps`

The next step is not another config-shape migration. It is to make the `@korri:gamescope` identity real in the first-party plugin system.

## Non-goals

Do **not** do these in this slice:

- Do not migrate `release.apps[]` to `launch.using`.
- Do not implement the broader provider/app-instance split.
- Do not migrate Steam to `@korri:steam` authored identity.
- Do not migrate RetroArch to `@korri:retroarch` authored identity.
- Do not migrate Moonlight to `stream.with."@korri:moonlight"`.
- Do not expose Gamescope runtime type/kind to config authors.
- Do not expose Steam-specific Gamescope implementation details such as `-e` or `steam-session` in authored config.
- Do not change the public Gamescope policy fields beyond what the previous slice already changed.
- Do not change launch behavior unless required to route through the plugin contribution.
- Do not push/open a PR unless explicitly asked.

## Design decision for this slice

### Author-facing config remains

```yaml
launch:
  with:
    "@korri:gamescope":
      enable: true
```

Authors identify the participant by stable plugin/provider id. They do not write:

```yaml
runtime:
  kind: launch-environment
```

or:

```yaml
gamescope:
  steam-session: true
```

### Internal model may remain transitional

For this slice, it is acceptable for the cascade/resolved launch context to continue carrying:

```ts
context.gamescope
```

internally, as long as authored config is read from `launch.with."@korri:gamescope"` and the `@korri:gamescope` identity is plugin-declared.

A later slice can replace internal `context.gamescope` with a generic launch companion map.

## Proposed implementation

### 1. Add Gamescope first-party plugin module

Create:

```text
product/plugins/gamescope/index.ts
```

Conceptual shape:

```ts
import { plugin } from "@platform/plugin"

export const gamescopePlugin = plugin({
  namespace: "@korri",
  name: "gamescope",
  title: "Gamescope",
  description: "Declares Gamescope as Korri's first-party launch companion.",
  contributes: {
    launchCompanions: [
      {
        id: "@korri:gamescope",
        role: "launch-wrapper",
        supports: { systems: ["*"] },
      },
    ],
  },
})
```

Exact type names may differ; add the minimal plugin API needed for this contribution.

### 2. Extend plugin contribution types minimally

Likely file:

```text
product/platform/plugin/index.ts
```

Add a first-pass contribution type. Keep it deliberately small.

Suggested types:

```ts
export type LaunchCompanionId = PluginId

export interface PluginLaunchCompanionContribution {
  readonly id: LaunchCompanionId
  readonly role: "launch-wrapper"
  readonly supports?: {
    readonly systems?: readonly string[]
  }
}

export interface PluginContributions {
  readonly catalog?: readonly PluginCatalogItem[]
  readonly resources?: readonly PluginResource[]
  readonly launchCompanions?: readonly PluginLaunchCompanionContribution[]
}
```

Do not overdesign ordering/phases yet. If a field is needed for future shape, keep it inert or leave it out.

### 3. Extend plugin registry normalization

Likely file:

```text
product/platform/plugin/registry.ts
```

Add registry exposure for launch companions, analogous to existing catalog/resource contributions.

Target behavior:

```ts
const registry = createPluginRegistry([gamescopePlugin], {
  enabledPluginIds: new Set(["@korri:gamescope"]),
})

registry.launchCompanions // contains @korri:gamescope contribution
```

Questions to decide during implementation:

- Should first-party infrastructure plugins like `@korri:gamescope` be always enabled?
- Or should they still be governed by `KORRI_ENABLED_PLUGINS`?

Recommendation for this slice:

- Treat launch companion infrastructure plugins as first-party built-ins that are registered in production by default.
- If that is too large for current registry semantics, register `@korri:gamescope` in `firstPartyPlugins` and make config/resolver validation consult the full first-party plugin list, not only user-enabled catalog plugins.
- Do **not** let disabling `KORRI_ENABLED_PLUGINS` break core Gamescope launch config unless the product explicitly supports that.

### 4. Register the plugin

Likely file:

```text
product/plugins/index.ts
```

Add:

```ts
import { gamescopePlugin } from "./gamescope"
import { neverballPlugin } from "./neverball"

export const firstPartyPlugins = [gamescopePlugin, neverballPlugin] as const
```

If registry enablement is split, consider names like:

```ts
export const firstPartyInfrastructurePlugins = [gamescopePlugin] as const
export const firstPartyCatalogPlugins = [neverballPlugin] as const
```

but avoid broad refactors unless necessary.

### 5. Centralize the Gamescope companion id

Avoid spreading string literals in config/resolver code.

Possible home:

```text
product/platform/plugin/ids.ts
```

or near the Gamescope plugin:

```ts
export const KORRI_GAMESCOPE_PLUGIN_ID = "@korri:gamescope" as const
```

Then use that constant in:

- plugin descriptor
- `launch.with` extraction helper
- tests
- any strict validation for launch companion keys

### 6. Validate `launch.with` against plugin-declared companions if practical

Current code may already hard-reject unknown `launch.with` keys. If so, change the source of truth from a handcoded string to the plugin-declared companion ids.

Minimal acceptable version:

- The schema still permits only `@korri:gamescope` for now.
- The allowed id is imported from the Gamescope plugin/platform constant.
- Add tests showing the id is also present in the plugin registry.

Better version, if low-risk:

- Decode allows plugin-id-shaped keys.
- Resolver validates keys against registered launch companion contributions and fails closed for unknowns.
- Unknown key example:

```yaml
launch:
  with:
    "@korri:not-real":
      enable: true
```

should fail with a config/validation error before launch.

## Files likely to touch

Plugin model/registration:

- `product/platform/plugin/index.ts`
- `product/platform/plugin/registry.ts`
- `product/platform/plugin/registry.test.ts`
- `product/plugins/index.ts`
- `product/plugins/gamescope/index.ts` (new)

Config extraction/validation, depending on current implementation:

- `product/platform/library/config/inheritable-fields.ts`
- `product/platform/library/config/cascade-resolver.ts`
- `product/platform/library/config/readable-cascade-resolver.ts`
- `product/platform/library/config/launch-block.ts`
- tests around those files

Useful examples/sketches:

- `out/config-sketches/plugin-produced-vs-authored.yaml`
- `out/config-sketches/full-plugin-identified-config-example.yaml`
- `out/config-sketches/launch-composition-config-sketch.yaml`

## Test requirements

Add/adjust focused tests before broad runs.

### Plugin tests

In `product/platform/plugin/registry.test.ts` or a new plugin-specific test:

- `@korri:gamescope` plugin id is stable.
- `gamescopePlugin.contributes.launchCompanions` includes `@korri:gamescope`.
- registry exposes the Gamescope launch companion contribution.
- Neverball catalog/resource behavior still works after adding the new contribution field.

### Config/resolver tests

Add or keep tests proving:

- authored `launch.with."@korri:gamescope"` decodes.
- authored top-level `gamescope` still fails strict decode.
- unknown launch companion key fails closed, either at schema decode or resolver validation.
- Gamescope merge semantics are unchanged:
  - deep merge nested objects;
  - `extraArgs` concat in inheritance order;
  - scalar last-wins;
  - more-specific `enable: false` disables inherited/default Gamescope.
- resolved launch context/intent still carries the expected internal Gamescope policy.

### Behavior regression tests

Keep existing Steam/Gamescope tests green:

- Steam baseline defaults still resolve to Gamescope enabled.
- Steam-specific Gamescope `-e` remains internal and is not exposed as authored config.
- Non-Steam launches still compose Gamescope normally.
- Neverball plugin remains visible/resolvable.

## Suggested test commands

Run focused tests first. Adjust paths to match actual changed files.

```sh
bun test \
  product/platform/plugin/registry.test.ts \
  product/platform/plugin/catalog-library-source.test.ts \
  product/plugins/library-source-layer.test.ts \
  product/platform/library/config/inheritable-fields.test.ts \
  product/platform/library/config/cascade-resolver.test.ts \
  product/platform/library/config/readable-cascade-resolver.test.ts \
  product/platform/library/config/app-integrations.test.ts
```

Then run relevant launch/API tests:

```sh
bun test \
  product/apps/portal/api/library/launch.rpc-handler.test.ts \
  product/apps/portal/api/stream/prepare.rpc-handler.test.ts \
  product/services/device/game-stream-runner.test.ts \
  product/platform/stream/gamescope-launch-spec.test.ts
```

Known caveat from prior work: full `bun run typecheck` may still report unrelated route-generation errors (`routeTree.gen`, route literal issues). If still true, record that explicitly rather than treating it as a regression.

## Acceptance criteria

This slice is complete when:

- `product/plugins/gamescope/index.ts` exists.
- `@korri:gamescope` is registered as a first-party plugin.
- Plugin contributions include a launch companion/wrapper declaration for Gamescope.
- Config/resolver code no longer treats `@korri:gamescope` as an unowned arbitrary string; the id is centralized and/or registry-backed.
- Authored `launch.with."@korri:gamescope"` still works.
- Authored top-level `gamescope` remains rejected.
- Unknown launch companion ids fail closed.
- Steam-inside-Gamescope behavior remains unchanged.
- Neverball plugin behavior remains unchanged.
- Focused tests are green.

## Open design questions to defer

Do not block this slice on these:

- Whether `apps` should become provider instances.
- Whether `providers` should exist as an authored top-level map.
- Whether `launch.using` replaces `release.apps[]`.
- Whether `launch.using` should be keyed map, scalar plus options, or object/list form.
- Whether Moonlight becomes `stream.with."@korri:moonlight"`.
- Whether `with` ordering needs author control.
- Whether internal `context.gamescope` should become a generic companion map.

## Suggested next slice after this

After Gamescope has a plugin-declared launch companion, the next design slice should likely be one of:

1. Introduce plugin-declared launch providers for Steam/RetroArch without changing authored release shape.
2. Add `stream.with."@korri:moonlight"` as a route-dependent stream client contribution.
3. Prototype `release.launch.using` for a single low-risk provider while preserving `release.apps[]`.
