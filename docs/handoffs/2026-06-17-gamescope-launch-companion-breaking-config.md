# Handoff: move authored Gamescope config to `launch.with."@korri:gamescope"` with no legacy compatibility

## Goal

Make the first real config-model change from the launch-composition design:

```yaml
launch:
  with:
    "@korri:gamescope":
      enable: true
```

becomes the **only** authored location for Gamescope launch policy.

Do **not** support the old authored shape:

```yaml
gamescope:
  enable: true
```

This is intentionally breaking. Top-level authored `gamescope` should fail schema decoding with a clear strict-schema error.

## Why this slice

Gamescope currently feels arbitrarily slotted into many layer records as a peer top-level policy blob. This change gives it the right conceptual home as a launch companion without also migrating:

- `release.apps[]` to `launch.using`
- Steam/RetroArch provider identity
- Moonlight to `stream.with`
- provider/app-instance modeling
- full plugin-produced in-memory documents

Keep this first slice narrow.

## Non-goals

Do not implement yet:

- `launch.using`
- keyed provider configs for Steam/RetroArch
- `stream.with."@korri:moonlight"`
- plugin ordering
- provider/app-instance split
- public aliasing from `gamescope` to `launch.with`
- migration fallback/backwards compatibility
- PR creation or push

## Design decision for this slice

### Authored/config record shape

Any record/layer that currently accepts the inheritable `gamescope` field should instead accept:

```yaml
launch:
  with:
    "@korri:gamescope": <GamescopePolicy>
```

Example at release level:

```yaml
library:
  stray:
    title: Stray
    launch:
      with:
        "@korri:gamescope":
          enable: true
    releases:
      - id: steam
        system: steam
        target: steam://run/1332010
        launch:
          with:
            "@korri:gamescope":
              enable: false
```

### Internal/runtime shape

To keep the slice small, the runtime/cascade output may continue to expose `context.gamescope` internally for now. Add a normalization/extraction layer that maps authored `launch.with."@korri:gamescope"` into the existing internal `gamescope` slot before/while resolving launch context.

In other words:

- authored records: **no `gamescope` field**
- decoded records: prefer storing `launch` shape
- resolved launch context / launch intent: may still carry `gamescope` internally

A later slice can rename internal `gamescope` to a launch companion map if desired.

## Likely implementation files

Core schema/model files:

- `product/platform/library/config/inheritable-fields.ts`
- `product/platform/library/config/records/global.ts`
- `product/platform/library/config/records/user.ts`
- `product/platform/library/config/records/system.ts`
- `product/platform/library/config/records/source.ts`
- `product/platform/library/config/records/launcher.ts`
- `product/platform/library/config/records/runtime.ts`
- `product/platform/library/config/records/app.ts`
- `product/platform/library/config/records/app-choice.ts`
- `product/platform/library/config/records/profile.ts`
- `product/platform/library/config/records/preset.ts`
- `product/platform/library/config/records/game.ts`
- `product/platform/library/config/records/collection.ts`
- `product/platform/library/config/records/library-item.ts`
- `product/platform/library/config/records/host.ts`
- `product/platform/library/config/ephemeral-override.ts`
- `product/platform/library/config/readable-cascade-resolver.ts`
- `product/platform/library/config/cascade-resolver.ts`
- `product/platform/library/config/resolved-launch-context.ts`

High-value tests to update/add:

- `product/platform/library/config/inheritable-fields.test.ts`
- `product/platform/library/config/records/*.test.ts`
- `product/platform/library/config/readable-cascade-resolver.test.ts`
- `product/platform/library/config/cascade-resolver.test.ts`
- `product/platform/library/config/app-integrations.test.ts`
- `product/platform/library/config/fixtures/*.korri.yaml`
- `korri-catalog-display-metadata.example.yaml`
- `product/platform/library/config/authoring/examples.test.ts`

## Suggested schema shape

In `inheritable-fields.ts`, add a launch companion schema near `InheritableLayer`.

Conceptual TypeScript shape:

```ts
const LaunchWithPolicy = Schema.Struct({
  "@korri:gamescope": Schema.optional(GamescopePolicy),
})

export const LaunchPolicy = Schema.Struct({
  with: Schema.optional(LaunchWithPolicy),
})

export const InheritableLayer = Schema.Struct({
  launch: Schema.optional(LaunchPolicy),
  moonlight: Schema.optional(MoonlightPolicy),
  retroarch: Schema.optional(RetroArchPolicy),
  ryubing: Schema.optional(RyubingPolicy),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  cwd: Schema.optional(Schema.String),
  argsAppend: Schema.optional(Schema.Array(Schema.String)),
  patches: Schema.optional(Schema.Array(Schema.String)),
})
```

Important: do **not** keep `gamescope` in `InheritableLayer`.

If Effect Schema object field names containing `@`/`:` are awkward, use `Schema.Record` with a refinement that only allows `@korri:gamescope` for this slice. Still reject all other keys for now.

## Normalization helper

Add a helper with an explicit name, e.g.:

```ts
export function gamescopePolicyFromLaunch(
  layer: { readonly launch?: LaunchPolicy },
): GamescopePolicy | undefined {
  return layer.launch?.with?.["@korri:gamescope"]
}
```

Use this wherever the resolver currently reads `layer.gamescope`.

For merging, preserve current Gamescope semantics:

- deep merge nested objects
- `extraArgs` concat in inheritance order
- scalar last-wins
- `enable: false` on a more-specific layer overrides prior enabled/defaults

## Breaking validation requirements

Add tests that old shape fails:

```ts
expect(() => decodeHostPayload({
  gamescope: { enable: true },
})).toThrow()
```

Add equivalent failure coverage for at least:

- host/global
- app
- app choice
- system or profile
- library item/release
- preset
- ephemeral override

Do not implement aliasing.

## Positive test examples

### Inheritable layer

```ts
const layer = decodeInheritableLayer({
  launch: {
    with: {
      "@korri:gamescope": {
        enable: true,
        scaling: { filter: "fsr" },
      },
    },
  },
})

expect(layer.launch?.with?.["@korri:gamescope"]?.enable).toBe(true)
```

### Cascade preservation

Adapt an existing resolver test that currently layers:

```ts
host.gamescope.extraArgs = ["host"]
profile.gamescope.extraArgs = ["profile"]
release.gamescope.extraArgs = ["release"]
```

to:

```ts
host.launch.with["@korri:gamescope"].extraArgs = ["host"]
profile.launch.with["@korri:gamescope"].extraArgs = ["profile"]
release.launch.with["@korri:gamescope"].extraArgs = ["release"]
```

Expected resolved internal `context.gamescope.extraArgs` remains:

```ts
["host", "profile", "release"]
```

## Built-in Steam baseline

Current Steam app integration contributes baseline Gamescope defaults internally. It may currently have:

```ts
gamescope: { enable: true }
```

For this slice, update the descriptor-facing shape if straightforward:

```ts
launch: {
  with: {
    "@korri:gamescope": { enable: true },
  },
}
```

If that balloons the slice, it is acceptable to keep `AppDescriptor.gamescope` as an internal-only field temporarily, but **authored `AppRecord`/schemas must not accept top-level `gamescope`**.

Whichever path is chosen, targeted Steam baseline tests must still prove:

- Steam baseline defaults to Gamescope
- user/app config can disable via `launch.with."@korri:gamescope".enable = false`
- Steam-specific Gamescope `-e` remains internal and not authored

## Config/examples migration

Update all committed YAML fixtures/examples that are part of tests from:

```yaml
gamescope:
  enable: true
```

to:

```yaml
launch:
  with:
    "@korri:gamescope":
      enable: true
```

Do not leave examples using old shape unless the example is explicitly documenting a rejected legacy form.

## Suggested workflow

1. Create a focused branch/worktree.
2. Add schema support for `launch.with."@korri:gamescope"` and remove top-level `gamescope` from authored schemas.
3. Add failing tests for old shape rejection and new shape acceptance.
4. Update resolver normalization to keep internal `context.gamescope` behavior unchanged.
5. Update fixtures/examples.
6. Run targeted tests:

```bash
bun test product/platform/library/config/inheritable-fields.test.ts \
  product/platform/library/config/records/host.test.ts \
  product/platform/library/config/records/app.test.ts \
  product/platform/library/config/records/app-choice.test.ts \
  product/platform/library/config/records/system.test.ts \
  product/platform/library/config/records/preset.test.ts \
  product/platform/library/config/records/game.test.ts \
  product/platform/library/config/readable-cascade-resolver.test.ts \
  product/platform/library/config/cascade-resolver.test.ts \
  product/platform/library/config/app-integrations.test.ts
```

7. Run relevant formatting/check:

```bash
bunx biome check --write product/platform/library/config
bun test product/platform/library/config
```

8. Run broader checks as time allows. Note: `bun run typecheck` may still have unrelated route-generation failures (`routeTree.gen`). Do not chase unrelated route-generation errors in this slice.

## Acceptance criteria

- Authored `launch.with."@korri:gamescope"` works at all former Gamescope-capable cascade layers.
- Authored top-level `gamescope` is rejected; no compatibility alias exists.
- Existing launch runtime behavior remains unchanged after resolution/materialization.
- Steam baseline still defaults to Gamescope internally and still keeps Steam `-e` internal.
- Fixtures/examples use the new shape.
- Targeted config and cascade tests pass.

## References

Design sketches produced during planning:

- `out/config-sketches/launch-composition-config-sketch.yaml`
- `out/config-sketches/launch-composition-alternatives.md`
- `out/config-sketches/full-plugin-identified-config-example.yaml`
- `out/config-sketches/plugin-produced-vs-authored.yaml`
