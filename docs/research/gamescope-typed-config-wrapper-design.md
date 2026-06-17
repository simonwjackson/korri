# Research: Typed Config Wrappers for External CLI Surfaces

**Date:** 2026-06-08  
**Scope:** NixOS-module-style option naming, env overlays with null/unset semantics,
backwards-incompatible config migrations, upstream CLI parity tracking.  
**Applied to:** Korri's Gamescope config plan (see `docs/brainstorms/2026-06-08-001-gamescope-policy-one-to-one.example.yaml`)

> Supersession note (2026-06-08): this research predates the final plan decision in
> `docs/plans/2026-06-08-001-feat-typed-gamescope-policy-api-plan.md` to make a
> breaking replacement. Any sections below that recommend keeping `forceXwayland`
> as sugar or adding a dual-field bridge are rejected for implementation; old
> Gamescope keys must fail strict decode.

---

## 1. NixOS-Module-Style Option Naming

### What the pattern actually means

NixOS modules wrap CLI programs behind typed option trees. The value is not that they
reproduce every flag as an option — it is that they describe *capability/intent*, not
*mechanism*. The codegen from option tree → CLI flags lives in the implementation, not
the config surface.

### Naming rules (derived from nixpkgs conventions and the brainstorm draft)

| Rule | Good | Avoid |
|---|---|---|
| Gate on `enable`, not `enabled` or `active` | `gamescope.enable` | `gamescope.enabled` |
| Group by domain, not by flag order | `display.output.width`, `display.nested.width` | `outputWidth`, `nestedWidth` |
| Describe intent, not the flag name | `scaling.filter: "nearest"` | `capitalF: "nearest"` (old `-n`) |
| `null` = no opinion / inherits | `sharpness: null` | `sharpness: undefined` |
| `false` = explicitly disabled | `enable: false` | using `null` to mean "disable" |
| Nested subsections, not flat namespace | `hdr.inverseToneMapping.enable` | `hdrItmEnabled` |
| Escape hatch always last, clearly named | `extraArgs: string[]` | `additionalFlags`, `rawArgs` |

**Naming convention for Korri's Schema types (Effect Schema, not Nix):**

- `enable` (not `enabled`) — aligns with nixpkgs `mkEnableOption` output type
- Nested groups: `display`, `scaling`, `hdr`, `vr`, `embedded`, `debug`
- Within a group: `enable` for feature gating, named fields for params
- The typed layer names the `_intent_`; `composeGamescopeLaunchSpec` translates to argv

### The brainstorm YAML's naming is sound with one fix

The draft uses `hdr.enable` (good) but mixes in some mechanism-level names like
`control.backend: "x11-root-atoms"` (which is fine — it's a product decision, not an
implementation detail leaking into config). The `control` section presence implies the
feature is in use; a separate `control.enable` boolean is redundant. Remove it and let
the config section's presence (non-null/non-absent) be the signal.

---

## 2. Env Overlays with Null/Unset Semantics

### The current gap

`InheritableLayer.env` is typed as `Record<string, string>`. It can only SET variables;
it cannot express "remove this variable from the child's environment." The `forceXwayland`
boolean works around this for the one known case but is not a general pattern.

The brainstorm YAML introduces:

```yaml
app:
  environment:
    WAYLAND_DISPLAY: null   # → env -u WAYLAND_DISPLAY
```

This is exactly the right pattern. Here is how to implement it correctly.

### Schema pattern: `string | null` per key

```ts
// Effect Schema
const EnvOverlay = Schema.Record(
  Schema.String,
  Schema.NullOr(Schema.String),
)
// `null` = unset the variable before spawning
// `"value"` = set/override to that value
// key absent = no operation (inherits from parent scope)
```

**Merge semantics** (important, differs from the plain-string `env` merge):

```
parent:  { A: "1", B: "2" }
child:   { B: null, C: "3" }
result:  { A: "1", C: "3" }   ← B is removed
```

More-specific `null` beats less-specific value. Absent means "no opinion."

### Render to `LaunchSpec`

```ts
function renderEnvOverlay(
  base: NodeJS.ProcessEnv,
  overlay: Record<string, string | null>,
): NodeJS.ProcessEnv {
  const result = { ...base }
  for (const [key, value] of Object.entries(overlay)) {
    if (value === null) delete result[key]
    else result[key] = value
  }
  return result
}
```

For the Gamescope wrapper specifically, the split is:
- `gamescope.environment` → env for the `gamescope` process itself
- `gamescope.app.environment` → env injected via `env -u KEY` / `env KEY=val` for the child

The child env overlay is composed after `--` in the argv, **not** by manipulating the
gamescope process's own environment.

### Migration path for `forceXwayland`

`forceXwayland: true` is semantically equivalent to:
```yaml
gamescope:
  app:
    environment:
      WAYLAND_DISPLAY: null
```

Keep `forceXwayland` in the schema as a named convenience for now — it is well-documented,
well-tested, and discoverable. At normalization time, expand it into the env overlay:

```ts
export function normalizeGamescopePolicy(policy: GamescopePolicy): ResolvedGamescopePolicy {
  const appEnv: Record<string, string | null> = {
    ...(policy.app?.environment ?? {}),
  }
  // forceXwayland sugar expands to env overlay
  if (policy.forceXwayland === true && !("WAYLAND_DISPLAY" in appEnv)) {
    appEnv["WAYLAND_DISPLAY"] = null
  }
  // explicit forceXwayland: false wins over inherited overlay
  if (policy.forceXwayland === false) {
    delete appEnv["WAYLAND_DISPLAY"]
  }
  return { ...policy, app: { environment: appEnv } }
}
```

Once the typed env overlay is exercised in production configs, open a backlog item to
deprecate `forceXwayland` in one cycle (keep the schema field, emit a warning at
normalization, remove in the next schema version).

---

## 3. Backwards-Incompatible Config Migrations

### Why this matters for Korri

The `InheritableLayer` schema decodes with `onExcessProperty: "error"` (strict whitelist).
This is the right call — it catches typos like `gamescpoe` at parse time with a clear
error message instead of silently inheriting from a less-specific layer. It means every
schema change has migration cost.

### Change taxonomy and strategies

#### (A) Additive new optional fields — non-breaking, preferred

Adding optional fields to the schema is safe. Old configs decode as before; new configs
can use the new fields. The brainstorm YAML's new feature groups (`hdr`, `vr`, `reshade`,
`embedded`, `debug`) are all additive. No migration needed.

**Rule:** Always prefer adding an optional field over renaming or restructuring.

#### (B) Field rename or restructure — breaking

Example: if `forceXwayland` is eventually renamed to `app.environment.WAYLAND_DISPLAY`
in the schema, old configs with `forceXwayland: true` will fail strict decode.

**Strategy — dual-field bridge (recommended for Korri's scale):**

1. Keep the old field, mark it with a JSDoc `@deprecated` comment.
2. In the decode/normalization path, map old → new explicitly.
3. Emit a warning log if the old field is present.
4. Remove the old field in the next major version cycle.

```ts
// During normalization:
if ("forceXwayland" in rawPolicy) {
  logger.warn("gamescope.forceXwayland is deprecated; use gamescope.app.environment.WAYLAND_DISPLAY: null")
}
```

Because the strict schema would reject configs with *both* old and new fields, the
bridge lives at the YAML decode stage before the strict validator runs:

```ts
const preprocess = (raw: unknown): unknown => {
  // Bridge legacy forceXwayland → new app.environment shape
  // This runs BEFORE strict schema validation
  if (isObject(raw) && "forceXwayland" in raw) {
    // ... transform
  }
  return raw
}
```

#### (C) Semantic change without schema change — worst kind

This is changing what a field *means* without renaming it. Example: changing `args`
from "appended before `--`" to "appended after `--`" would silently break existing
configs.

**Rule:** Never change semantics without changing the field name or adding a `version`
discriminator. Document the field's semantics in the JSDoc at the type level, not just
in a README.

#### (D) Schema versions for multi-generation migration

For truly breaking rewrites (not expected soon), a `version` discriminator is the
pragmatic path:

```ts
const ConfigV1 = Schema.Struct({ version: Schema.Literal("1"), /* v1 fields */ })
const ConfigV2 = Schema.Struct({ version: Schema.Literal("2"), /* v2 fields */ })
const Config = Schema.Union(ConfigV1, ConfigV2)

const toCurrentVersion = (raw: ConfigV1 | ConfigV2): ConfigV2 =>
  raw.version === "1" ? migrateV1ToV2(raw) : raw
```

For Korri's YAML config format, a top-level `$schema` or `apiVersion` field (following
Kubernetes/Helm convention) is the user-visible version marker. Default to omitted for
the current format; require it if a v2 ever ships.

### Safe migration checklist

Before renaming or restructuring a schema field:
1. Add the new field as optional.
2. Write a normalization bridge from old → new.
3. Add a test for configs using the old field (should still decode correctly).
4. Log a warning when the old field is detected.
5. Ship the bridge.
6. After one cycle where both fields coexist, remove the old field.
7. Update the strict schema to reject the old field.

---

## 4. Maintaining Parity with Upstream CLI Changes

### The core problem

Gamescope's CLI surface evolves: `-n` for nearest-neighbor was replaced by `-F nearest`.
`--sharpness` and `--fsr-sharpness` are aliases pointing to the same internal flag.
New flags appear (e.g., `--virtual-connector-strategy`) without documentation.

### Strategy: intent schema + single flag-mapping module

The typed schema describes *intent*; a single translation layer maps intent → argv for
the pinned vendor version. When Gamescope renames a flag:

1. The schema field name stays unchanged (it describes intent, not the flag).
2. Only the mapping function changes.

```ts
// gamescope-argv-builder.ts — the only place that knows CLI flag names

export function buildGamescopeArgv(policy: ResolvedGamescopePolicy): string[] {
  const args: string[] = []

  if (policy.scaling?.filter) {
    // Upstream changed: older versions used -n, current uses -F nearest
    args.push("-F", policy.scaling.filter)      // maps "nearest" → "-F nearest"
  }

  if (policy.scaling?.scaler) {
    args.push("-S", policy.scaling.scaler)
  }

  // ... other fields

  // Escape hatch: caller-supplied args appended last (before --)
  args.push(...(policy.extraArgs ?? []))
  args.push("--")

  return args
}
```

This concentrates all upstream-coupling into one module. A grep for the old flag name
(`-n`) finds exactly one place to update.

### Vendor-pinning as the parity fence

Korri pins `gamescope-korri` and controls vendor bumps intentionally through
`product/plugins/gamescope/packages/gamescope-korri/default.nix`. This is the correct architecture:

- The schema and the flag-mapping module are updated **together** when bumping the vendor.
- CI catches regressions at the Nix evaluation layer (if the binary changes behavior)
  and at the TypeScript unit layer (if the argv composition changes).
- `extraArgs` absorbs flags that exist in the newly pinned version but have not yet been
  added to the typed schema.

### Tracking upstream changes in practice

1. **Maintain a `CHANGELOG.md` in `product/plugins/gamescope/`** noting which
   upstream flags were added/renamed/removed in each vendor bump.
2. **Flag new upstream flags as `extraArgs` first**, then promote to typed fields once
   the semantics are understood and tested.
3. **Check `gamescope --help` output as part of vendor bump review** — diff it against
   the previous pinned version to catch flag additions/renames.
4. **Write a test for `buildGamescopeArgv`** that asserts the current flag names for
   each typed field, so CI fails loudly if the mapping becomes stale.

### The `extraArgs` contract

`extraArgs` (already in the brainstorm YAML) is the safety valve. Keep it in the schema
permanently. Never remove it. Define its insertion point precisely:

- `extraArgs` for the Gamescope process: appended **after** all typed flags, **before** `--`.
- `extraArgs` for the child app: not currently modelled; child env overlay is the
  preferred path for child env manipulation; typed child args are not in scope v1.

---

## 5. Synthesis: Applied to Korri's Brainstorm YAML

### What to keep as-is

- Domain-grouped nesting (`display.output`, `display.nested`, `scaling`, `hdr`, `vr`)
- `null` values meaning "not configured" (absent defaults)
- `extraArgs: []` escape hatch at the end
- `app.environment` with `null` unset semantics
- `control.backend: "x11-root-atoms"` (product decision, not mechanism leak)

### What to adjust

| Brainstorm field | Recommendation |
|---|---|
| `hdr.enable` (already `enable` not `enabled`) | ✅ keep |
| `control.enable: true` | Remove — presence of `control:` section is the signal |
| `window.fullscreen`/`window.borderless` | Consider moving to a `defaults` group; these are launch defaults for the kiosk profile, not per-game tuning |
| `app.environment: {}` | Type as `Record<string, string \| null>` in the Effect Schema, not plain `Record<string, string>` |
| `forceXwayland` (top-level) | Keep in schema as sugar, expand to `app.environment.WAYLAND_DISPLAY: null` at normalization |
| `control.unsupported.structuredCommandResult` | Move behind a `capabilities` or `experimental` key to signal its provisional nature |

### Schema additions to `GamescopePolicy` in priority order

1. **`app.environment: Record<string, string | null>`** — generalizes `forceXwayland`,
   unblocks the Bandai/RK3566 workaround pattern cleanly.
2. **`scaling.scaler` and `scaling.filter`** — both are already runtime-controllable
   via the control bridge; typed here for launch-time defaults.
3. **`display.output.*` and `display.nested.*`** — rename removes the confusing `-W`/`-w`
   duality in the current `args`-only approach.
4. **`extraArgs: string[]`** — add to `GamescopePolicy` as the typed escape hatch.
5. All other sections (`hdr`, `vr`, `embedded`, `debug`) additive when needed.

### Migration path for `forceXwayland`

```
Phase 1 (now): Add app.environment overlay; forceXwayland still in schema
              Normalization bridges forceXwayland → app.environment overlay
Phase 2 (next cycle): Log deprecation warning if forceXwayland is present in a config
Phase 3 (later cycle): Remove forceXwayland from schema; existing configs will get
                       a clear error from strict decode pointing them to app.environment
```

---

## 6. Cross-Cutting Rules

These apply to any typed CLI wrapper in this stack, not just Gamescope.

1. **Intent names in schema; mechanism names only in the argv builder.** The schema field
   `scaling.filter: "nearest"` survives upstream renaming `-n` → `-F nearest`.

2. **`null` = no-opinion in cascade layers; `false` = explicit disable.** Do not overload
   `null` to mean "disable a boolean feature."

3. **Env overlays use `string | null`**; `null` = unset. Do not implement per-variable
   unset through named boolean fields like `forceXwayland`.

4. **Strict decode mode (`onExcessProperty: "error"`) is the typo guard.** Keep it.
   It means adding a field requires updating the schema, which surfaces schema drift.

5. **One argv builder module.** All flag-name knowledge lives there. Change upstream flag
   name → change one function, one place.

6. **`extraArgs` is permanent.** It is not a transitional feature. It absorbs the future
   surface area that has not yet been typed.

7. **Migration bridges live before the strict validator.** Preprocess raw config to bridge
   old fields to new before running strict schema decode. Log deprecation warnings there.

8. **Vendor changelog documents flag-surface changes.** The diff between vendor versions
   is a required part of the review for any vendor bump.
