# Repo Research: `@korri:remap` Plugin Refactor

> Planning context: refactor the just-landed launch-owned CDP input bridge into a
> general launch-scoped remapping plugin/config shape. Product-facing `@korri:remap`
> under `launch.with`, no CDP/Chrome terminology in authored config, compact dot-path
> bindings, multi-controller support, gamepad-to-keyboard and gamepad-to-gamepad
> bindings, fail-closed isolation, InputPlumber-normalized sources.

---

## Technology & Infrastructure

- **Language**: TypeScript (strict), ~71%; TSX ~12%; Nix ~10%
- **Runtime / bundler**: Bun (primary), tsx for certain scripts
- **Test runner**: `bun test` (`just test-unit`)
- **Formatter / linter**: Biome (`just lint`, `just format`)
- **Build**: Vite (portal), Nix flakes for system packages
- **Effect version**: v4 (`effect`, `@effect/atom-react`)
- **Dev environment**: Nix flakes + direnv; `just` for task automation

---

## Architecture & Structure

### Plugin model

Every first-party capability is a **`KorriPlugin`** declared via `plugin({ namespace, name, ... })` in `product/platform/plugin/index.ts`. Plugins:

- Get a stable `ProviderId`: `"@{namespace}:{name}"` (e.g. `"@korri:gamescope"`).
- Declare handlers (operations they handle), config contributions (catalog entries, modules, launchers), and capabilities.
- Are registered in `product/plugins/index.ts` → `firstPartyPlugins`, `firstPartySessionLifecycleHookFactories`, `firstPartyPluginDaemonFactories`.

### `launch.with` — the authored companion map

`InheritableLayer.launch.with` is a `Record<ProviderId, unknown>` where each value is opaque at the schema level and decoded by the owning plugin. Defined in:

```
product/platform/library/config/inheritable-fields.ts
  LaunchWithPolicy = LaunchCompanionMap = Record<ProviderIdKey, unknown>
  LaunchPolicy = { with?: LaunchWithPolicy }
  InheritableLayer = { launch?: LaunchPolicy, ... }
```

Cascade fold rules (from `cascade-resolver.ts` JSDoc):
- Object values **deep-merge** across inheritance layers.
- Arrays **concatenate** in inheritance order.
- Scalars **last-win** (more specific wins).

`launchCompanionsFromLaunch(layer)` extracts `layer.launch?.with` as `LaunchCompanionMap`.

### Launch companion composition (launch.with → spec wrapping)

`composeLaunchCompanions()` in `product/platform/plugin/launch-companion.ts` iterates the `launchCompanions` map and calls each registered plugin's `launch.compose` handler to wrap the `LaunchSpec`. This is for **launch-time spec mutation** (e.g. wrapping in `gamescope ...`). It runs in the Portal API RPC handler **before** the spec is handed to sessiond.

**Important**: `launch.with` companions are consumed for spec composition. They are NOT automatically forwarded to sessiond or to session lifecycle hooks. The `ResolvedLaunch` struct has both `launchCompanions?: LaunchCompanionMap` and `launchMetadata?: LaunchMetadata` as separate fields.

### Session lifecycle hooks

Defined in `product/platform/plugin/session-lifecycle.ts`:

```ts
export interface KorriSessionLifecycleHookStartRequest {
  readonly launchId: string
  readonly spec: LaunchSpec
  readonly launchMetadata?: LaunchMetadata     // ← how policy reaches hooks today
  readonly terminateLaunch?: () => void
}

export interface KorriSessionLifecycleHook {
  readonly id: PluginId | (string & {})
  readonly failurePolicy?: "fail-launch" | "warn"
  readonly afterChildRunning?: (req) => Promise<KorriSessionLifecycleHookHandle | undefined>
  readonly cleanup?: (req) => Promise<...>
}
```

Sessiond calls `afterChildRunning` for each registered hook after the child process starts. Hooks registered in `product/plugins/index.ts → firstPartySessionLifecycleHookFactories`.

The `launchMetadata.annotations[pluginId]` is the **current** mechanism for per-launch policy reaching a hook. The new `@korri:remap` plugin needs its policy to be visible here from `launch.with["@korri:remap"]`.

### The annotation vs. companion gap (critical for this refactor)

| Surface | Reaches lifecycle hook via | Used for |
|---------|---------------------------|----------|
| `launchMetadata.annotations[id]` | `afterChildRunning({ launchMetadata })` | CDP bridge (current, to retire) |
| `launch.with[id]` | `composeLaunchCompanions()` → spec wrapping | Gamescope (wrapper pattern) |

`@korri:remap` is a **session lifecycle hook**, not a launch wrapper. Its policy must reach `afterChildRunning`. Options:

**Option A — Recommended**: Extend `KorriSessionLifecycleHookStartRequest` with `launchCompanions?: LaunchCompanionMap`. Thread it through `LaunchExtras` (or a new extras field) from the RPC handler → sessiond → lifecycle hooks. The hook then reads `request.launchCompanions?.["@korri:remap"]`.

**Option B** (messier): In the cascade resolver, translate `launch.with["@korri:remap"]` into `launchMetadata.annotations["@korri:remap"]` so the existing hook interface works unchanged. Avoids interface changes but couples the resolver to plugin knowledge.

**Option C**: Add `launchCompanions` to `LaunchExtras` so sessiond already receives them without a separate interface change to the hook request.

Option A is cleanest: lifecycle hooks are already the right seam; adding `launchCompanions` to the request is additive and consistent with how `launchMetadata` was added before.

---

## Current CDP Input Bridge — Files & Patterns to Refactor

### Core files

| File | Role |
|------|------|
| `product/plugins/cdp-input-bridge/index.ts` | Plugin declaration, re-exports |
| `product/plugins/cdp-input-bridge/src/policy.ts` | Policy schema + decode; reads `launchMetadata.annotations` |
| `product/plugins/cdp-input-bridge/src/mapping.ts` | Hard-coded named mapping presets (`yfs-default`, `none`) with CDP types |
| `product/plugins/cdp-input-bridge/src/bridge-process.ts` | Process lifecycle, evtest line parsing, CDP keyboard translator |
| `product/plugins/cdp-input-bridge/src/session-lifecycle-hook.ts` | Wires policy → process manager → lifecycle hook |
| `product/plugins/cdp-input-bridge/src/diagnostics.ts` | Diagnostics collection handler |
| `product/plugins/cdp-input-bridge/packages/korri-cdp-input-bridge/index.ts` | Bun entry script: CLI arg parsing, evtest, CDP WebSocket |
| `product/plugins/cdp-input-bridge/nix/cdp-input-bridge.nix` | Nix derivation for the binary |
| Tests: `*.test.ts` per src file | Comprehensive unit coverage |

### Current policy annotation shape (in YFS catalog entry)

```ts
// product/plugins/yoshis-fabrication-station/index.ts
launchMetadata: {
  annotations: {
    [CDP_INPUT_BRIDGE_PLUGIN_ID]: {  // "@korri:cdp-input-bridge"
      enable: true,
      cdpPort: 9333,
      mapping: "yfs-default",
      sourcePreference: { names: ["Microsoft Xbox Series S|X Controller"] },
      target: { type: "page", urlPattern: "index.html" },
    },
  },
},
```

### Current policy fields (to rename/restructure)

| Current field | CDP-specific | New shape |
|---|---|---|
| `enable: true` | No | Keep as opt-in gate |
| `cdpHost`, `cdpPort` | YES — implementation detail | Remove from authored config; keep as internal defaults |
| `mapping: "yfs-default"` | YES — named preset | Replace with inline `bindings` |
| `sourcePreference.names` | No | Keep as `source.names` |
| `sourcePreference.eventNodes` | No | Keep as `source.event-nodes` |
| `target.type`, `target.urlPattern`, `target.titlePattern` | YES — CDP-specific | Remove from authored remap config |
| `axis.pressThreshold`, `axis.releaseThreshold` | No | Keep as `axis.press-threshold`, `axis.release-threshold` |
| `attachTimeoutMs` | Partially | Keep as `attach-timeout-ms` |
| `failClosed` | No | Keep as `fail-closed` |

### InputPlumber-normalized evdev codes in current mapping

The `YFS_DEFAULT_MAPPING` uses raw evdev button codes that must be remapped to InputPlumber-normalized logical names in the new dot-path scheme:

| Evdev code | Logical name (proposed) |
|---|---|
| `BTN_DPAD_UP` | `dpad.up` |
| `BTN_DPAD_DOWN` | `dpad.down` |
| `BTN_DPAD_LEFT` | `dpad.left` |
| `BTN_DPAD_RIGHT` | `dpad.right` |
| `BTN_WEST` | `btn.west` |
| `BTN_SOUTH` | `btn.south` |
| `BTN_EAST` | `btn.east` |
| `BTN_NORTH` | `btn.north` |
| `BTN_START` | `btn.start` |
| `ABS_X` (axis) | `stick.left.x` |
| `ABS_Y` (axis) | `stick.left.y` |
| `ABS_RX` (axis) | `stick.right.x` |
| `ABS_RY` (axis) | `stick.right.y` |

Button code constants are in `product/platform/input/native/button-codes.ts`. InputPlumber virtual gamepad resolution is in `product/platform/input/native/inputplumber-virtual-gamepad.ts`.

---

## `@korri:gamescope` — the Target Pattern

```
product/plugins/gamescope/
  index.ts                    — re-exports plugin and id
  src/plugin.ts               — plugin declaration with handlers
  src/launch-companion/
    policy.ts                 — GamescopePolicy Schema, decode, fold, normalize
    wrapper.ts                — composeGamescopeLaunchSpec() wraps LaunchSpec
    index.ts                  — exports
  src/session/
    lifecycle-hook.ts         — createGamescopeSessionLifecycleHook() (control bridge sidecar)
```

**Key reference**: `gamescopePolicyFromLaunch()` in `src/launch-companion/policy.ts`:

```ts
export const gamescopePolicyFromLaunch = (layer: {
  readonly launch?: {
    readonly with?: Partial<Record<string, GamescopePolicy | undefined>>
  }
}): GamescopePolicy | undefined =>
  layer.launch?.with?.[KORRI_GAMESCOPE_PLUGIN_ID]
```

This is how a plugin reads **its own** policy from a `launch.with` layer. For `@korri:remap`, create an equivalent `remapPolicyFromLaunch()` that reads `layer.launch?.with?.["@korri:remap"]`.

**Key difference from cdp-input-bridge**: Gamescope's `plugin.ts` registers a `launch.compose` handler that wraps the spec. The session lifecycle hook for gamescope is **separate** and manages only the runtime control bridge sidecar. Gamescope does **not** need `launchMetadata` in its lifecycle hook.

`@korri:remap` is different: it needs its config at **session runtime** (in `afterChildRunning`), not at launch composition time. This means either the `launch.with` value must reach the lifecycle hook (via `launchCompanions` in the request) or through the `launchMetadata.annotations` channel.

---

## New `@korri:remap` Config Shape

### Authored format (`launch.with["@korri:remap"]`)

```yaml
launch:
  with:
    "@korri:remap":
      enable: true
      controllers:
        - source: p1                # slot identifier, not a device path
          bindings:
            dpad.down: key.down
            dpad.up: key.up
            dpad.left: key.left
            dpad.right: key.right
            btn.west: key.z
            btn.south: key.a
            btn.east: key.x
            btn.north: key.s
            btn.start: key.p
            stick.left.x: stick.left.x  # gamepad-to-gamepad example
        - source: p2
          bindings:
            dpad.down: key.s
            dpad.up: key.w
```

Alternatively the user's preferred compact form uses flat dot-path keys:
```yaml
"@korri:remap":
  "p1.dpad.down": "key.down"
  "p1.dpad.up": "key.up"
  "p1.btn.west": "key.z"
  "p2.dpad.down": "key.s"
```

Clarify with user: nested `controllers[]` array vs flat `p1.*` key prefix. Both convey the intent; the flat form is more compact but harder to validate with strict schemas.

### Design decisions per user requirements

| Requirement | Decision |
|---|---|
| No CDP/Chrome terminology | Remove `cdpHost`, `cdpPort`, `target.*`, `mapping` named presets entirely from authored config |
| Single-word plugin name `remap` | `@korri:remap`, plugin dir `product/plugins/remap/` |
| Under `launch.with` | Not `launchMetadata.annotations` |
| Compact dot-path bindings | `p1.dpad.down: key.down` (source: `{slot}.{input}`, target: `{kind}.{name}`) |
| Kebab-case names | `fail-closed`, `press-threshold`, `release-threshold`, `event-nodes`, etc. |
| No profiles/presets | Inline bindings only; no `mapping: "yfs-default"` |
| Multiple controllers | `p1`, `p2`, … slot identifiers |
| Gamepad-to-keyboard | Target: `key.{dom-key-name}` |
| Gamepad-to-gamepad | Target: `btn.{name}` or `stick.{side}.{axis}` |
| Fail-closed isolation | `fail-closed` defaults to `true`; hook `failurePolicy: "fail-launch"` |
| InputPlumber-normalized sources | Use `resolveInputPlumberVirtualGamepad()` unchanged |

---

## Implementation Patterns

### Plugin declaration pattern (from `gamescope/src/plugin.ts`)

```ts
export const remapPlugin = plugin({
  namespace: "@korri",
  name: "remap",
  title: "Input Remap",
  description: "Launch-scoped controller-to-keyboard and controller-to-controller remapping.",
  contributes: {
    handlers: [
      {
        id: "remap.diagnostics",
        operation: "diagnostics.collect",
        capabilities: ["diagnostics.collect", "input.remap"],
        run: context => collectRemapDiagnostics(context.input),
      },
    ],
  },
})
```

Note: `@korri:remap` does NOT need a `launch.compose` handler (it doesn't wrap the spec). It is purely a session sidecar.

### Session lifecycle hook factory pattern (from `cdp-input-bridge/src/session-lifecycle-hook.ts`)

```ts
export function createRemapSessionLifecycleHook(
  options: RemapSessionLifecycleHookOptions = {},
): KorriSessionLifecycleHook {
  return {
    id: KORRI_REMAP_PLUGIN_ID,
    failurePolicy: "fail-launch",
    afterChildRunning: async ({ launchId, launchCompanions, terminateLaunch }) => {
      // reads policy from launchCompanions["@korri:remap"] once interface is extended
      const policy = decodeRemapPolicy(launchCompanions?.[KORRI_REMAP_PLUGIN_ID])
      if (!policy.enabled) return undefined
      // ... start bridge process per controller slot
    },
  }
}
```

### Effect Schema policy decode pattern (from `cdp-input-bridge/src/policy.ts`)

```ts
const STRICT = { onExcessProperty: "error" } as const

const RawPolicy = Schema.Struct({
  enable: Schema.optional(Schema.Boolean),
  "fail-closed": Schema.optional(Schema.Boolean),
  // ...
})

export function decodeRemapPolicy(input: unknown): RemapPolicy {
  if (input === undefined) return { enabled: false }
  const raw = Schema.decodeUnknownSync(RawPolicy)(input, STRICT)
  if (raw.enable !== true) return { enabled: false }
  return { enabled: true, /* ... */ }
}
```

### Process manager pattern (from `cdp-input-bridge/src/bridge-process.ts`)

The `createProcessCdpInputBridge()` factory returns a `CdpInputBridgeProcessManager` that:
1. Validates arguments (`resolveBridgeMapping`)
2. Spawns a child process (injectable `spawn` parameter for testing)
3. Waits for a readiness signal on stdout (`"korri-cdp-input-bridge: ready"`)
4. Returns a `handle` with `pid`, `exited` promise, and `stop()`

For `@korri:remap`, this becomes `createRemapBridgeProcessManager()`. The process name changes to `korri-remap` (or `korri-input-remap`); the args change to pass binding config instead of CDP args.

### Nix binary derivation pattern (from `cdp-input-bridge/nix/cdp-input-bridge.nix`)

```nix
{ lib, writeShellApplication, bun, evtest }:
writeShellApplication {
  name = "korri-remap";
  runtimeInputs = [ bun evtest ];
  text = ''
    exec ${lib.getExe bun} run ${../.}/packages/korri-remap/index.ts "$@"
  '';
}
```

### Test double pattern (from existing tests)

```ts
// Inject a fake process manager
const hook = createRemapSessionLifecycleHook({
  devices: async () => singleDevice,
  processManager: {
    start: async request => {
      starts.push(request)
      return { pid: 111, stop: async () => {} }
    },
  },
})
```

Tests are in `*.test.ts` colocated with each source file. No `__mocks__` or `Mock*` prefixes.

### Plugin registration pattern (from `product/plugins/index.ts`)

```ts
// Add to firstPartyPlugins array
export const firstPartyPlugins = [
  // ...existing...
  remapPlugin,
  // Keep cdp-input-bridge for migration period or remove
] as const

// Add to firstPartySessionLifecycleHookFactories
export const firstPartySessionLifecycleHookFactories = [
  // ...existing...
  {
    pluginId: remapPlugin.id,
    create: createRemapSessionLifecycleHook,
  },
] satisfies readonly KorriSessionLifecycleHookFactory[]
```

### YFS catalog entry update pattern

After the refactor, `yoshis-fabrication-station/index.ts` changes from:
```ts
launchMetadata: {
  annotations: { [CDP_INPUT_BRIDGE_PLUGIN_ID]: { enable: true, cdpPort: 9333, mapping: "yfs-default", ... } },
},
```
To (`ProcessPluginLaunch.with` field, or via the game's `launch.with` in inherited config):
```ts
with: {
  [KORRI_REMAP_PLUGIN_ID]: {
    enable: true,
    controllers: [
      {
        source: "p1",
        bindings: {
          "dpad.down": "key.down",
          "dpad.up": "key.up",
          "dpad.left": "key.left",
          "dpad.right": "key.right",
          "btn.west": "key.z",
          "btn.south": "key.a",
          "btn.east": "key.x",
          "btn.north": "key.s",
          "btn.start": "key.p",
        },
        source: { names: ["Microsoft Xbox Series S|X Controller"] },
      },
    ],
  },
},
```

---

## Issue Conventions

This is a single-author project with no GitHub Issue templates or external contribution guidelines found. The `AGENTS.md` and `CLAUDE.md` at root are the primary agent-facing convention docs.

---

## Documentation Insights

### AGENTS.md / CLAUDE.md

- Present at root. Must be read before any coding work.
- `AGENTS.local.md` for machine-local overrides.

### Naming conventions (kebab-case in authored config; confirmed by `launch-composition-config-sketch.yaml`)

> "Author-facing structural keys use kebab-case only: no camel-case and no snake-case."

All new authored policy fields must be kebab-case:
- `fail-closed` (not `failClosed`)
- `press-threshold`, `release-threshold`
- `event-nodes` (not `eventNodes`)
- `attach-timeout-ms`

TypeScript internal field names may stay camelCase (decoded from kebab schema).

### Plan/design files

- `out/config-sketches/launch-composition-config-sketch.yaml` — canonical example of `launch.with` authored shape
- `out/config-sketches/plugin-produced-vs-authored.yaml` — documents produced vs authored separation
- `docs/handoffs/2026-06-17-gamescope-plugin-launch-companion-temporary-handoff.md` — how gamescope was migrated; directly relevant
- `work/items/parking-lot/01KVNHQKSVADKGYYNTD6G699R9-productize-scoped-controller-to-keyboard-input-for-yfs-style.md` — the backlog item this refactor addresses

---

## Templates Found

No GitHub Issue/PR templates found (no `.github/ISSUE_TEMPLATE/` or `.github/pull_request_template.md`). This is a solo project.

---

## Implementation Patterns Summary

### Files to create (new `@korri:remap` plugin)

```
product/plugins/remap/
  index.ts                          — plugin declaration + re-exports
  src/
    policy.ts                       — RemapPolicy schema; reads from launch.with companion map
    binding-resolver.ts             — dot-path binding → evdev code + target action resolver
    session-lifecycle-hook.ts       — createRemapSessionLifecycleHook()
    bridge-process.ts               — createRemapBridgeProcessManager()
    diagnostics.ts                  — collectRemapDiagnostics()
    policy.test.ts
    binding-resolver.test.ts
    session-lifecycle-hook.test.ts
    bridge-process.test.ts
    diagnostics.test.ts
  packages/
    korri-remap/
      index.ts                      — Bun entry: CLI args, evtest, output dispatch (keyboard or gamepad)
      package.json
      README.md
  nix/
    remap.nix                       — writeShellApplication for korri-remap binary
  plugin.test.ts
  README.md
```

### Files to modify

| File | Change |
|---|---|
| `product/platform/plugin/session-lifecycle.ts` | Add `launchCompanions?: LaunchCompanionMap` to `KorriSessionLifecycleHookStartRequest` |
| `product/services/device/sessiond.ts` | Thread `launchCompanions` through to `afterChildRunning` call |
| `product/plugins/index.ts` | Register `remapPlugin` in `firstPartyPlugins` and `firstPartySessionLifecycleHookFactories` |
| `product/plugins/yoshis-fabrication-station/index.ts` | Replace `launchMetadata.annotations[CDP_INPUT_BRIDGE_PLUGIN_ID]` with `with[KORRI_REMAP_PLUGIN_ID]` |
| `product/plugins/cdp-input-bridge/index.ts` | Mark as deprecated or remove; keep binary for any remaining consumers |

### Interface change needed in platform (session-lifecycle.ts)

```ts
import type { LaunchCompanionMap } from "@platform/library/config/inheritable-fields"

export interface KorriSessionLifecycleHookStartRequest {
  readonly launchId: string
  readonly spec: LaunchSpec
  readonly launchMetadata?: LaunchMetadata
  readonly launchCompanions?: LaunchCompanionMap  // ← ADD THIS
  readonly terminateLaunch?: () => void
}
```

Then in `sessiond.ts`, the call becomes:
```ts
await hook.afterChildRunning({
  launchId,
  spec,
  ...(launchMetadata ? { launchMetadata } : {}),
  ...(launchCompanions ? { launchCompanions } : {}),  // ← thread through
  ...(active?.terminate ? { terminateLaunch: active.terminate } : {}),
})
```

The `launchCompanions` must be threaded from the resolved launch through `LaunchExtras` to sessiond. Check `game-stream-launch-intent.ts` and `sessiond.ts` receive/store paths for the right injection point.

---

## Recommendations

### 1. Extend the lifecycle hook request first (lowest risk)

Before creating the `@korri:remap` plugin, add `launchCompanions?: LaunchCompanionMap` to `KorriSessionLifecycleHookStartRequest` and thread it from the Portal RPC handler → `LaunchExtras` → sessiond → hook calls. This is a non-breaking additive change. Existing hooks (`@korri:gamescope`, `@korri:steam`, `@korri:cdp-input-bridge`) already ignore unknown fields.

### 2. Keep `@korri:cdp-input-bridge` binary intact during migration

The `korri-cdp-input-bridge` binary is a Bun + evtest script. The new `korri-remap` binary can share its CDP dispatch logic if needed. Start fresh for the new plugin, but don't delete `cdp-input-bridge` until YFS is migrated and tested on Sobo.

### 3. Confirm the flat vs. nested binding config shape with user

The user said "compact dot-path bindings like `p1.dpad.down: key.down`". This could mean:
- **Flat record**: `{ "p1.dpad.down": "key.down" }` — simpler schema, flat map
- **Nested**: `{ controllers: [{ source: "p1", bindings: { "dpad.down": "key.down" } }] }` — more structured, better for multi-source disambiguation

The flat form is more compact as the user requested. The nested form is more robust for per-controller `source.names` hints. Clarify before designing the `RemapPolicy` schema.

### 4. Gamepad-to-gamepad binding implementation gap

The current CDP bridge only dispatches **keyboard events via CDP**. A gamepad-to-gamepad binding requires a different output mechanism (e.g. uinput virtual device or InputPlumber profile). This is a non-trivial addition. The fail-closed safety contract must still hold. Recommend implementing keyboard targets first and flagging gamepad output as a future extension.

### 5. Check `product/platform/library/config/cascade-resolver.ts` for companion threading

The resolver already calls `composeLaunchCompanions()`. Whether the resolved `launchCompanions` map is included in the `LaunchExtras` payload sent to sessiond is a key gap to verify. Look at lines 509+ in `cascade-resolver.ts` and the `launchLocalForegroundSession()` call path in `launch.rpc-handler.ts`.

### 6. Verification commands for this refactor

```sh
just typecheck
bun test product/plugins/remap/
bun test product/platform/plugin/session-lifecycle.test.ts
bun test product/services/device/sessiond-plugin-composition.test.ts
bun test product/plugins/yoshis-fabrication-station/
just lint
```

---

## Key Files Reference

| Path | What it is |
|---|---|
| `product/platform/plugin/index.ts` | `plugin()`, `KorriPlugin`, `PluginHandler`, `ProcessPluginLaunch` (has `with?: Record<ProviderId, unknown>`) |
| `product/platform/plugin/session-lifecycle.ts` | `KorriSessionLifecycleHook`, `KorriSessionLifecycleHookStartRequest` |
| `product/platform/plugin/launch-companion.ts` | `composeLaunchCompanions()` — how `launch.with` values run `launch.compose` handlers |
| `product/platform/plugin/launch-metadata.ts` | `LaunchMetadata`, `decodeLaunchMetadata` |
| `product/platform/library/config/inheritable-fields.ts` | `LaunchWithPolicy`, `LaunchCompanionMap`, `InheritableLayer`, `launchCompanionsFromLaunch()` |
| `product/platform/library/config/cascade-resolver.ts` | Config cascade fold logic for `launch.with` |
| `product/platform/library/library-services.ts` | `ResolvedLaunch` — has both `launchCompanions?` and `launchMetadata?` |
| `product/platform/input/native/inputplumber-virtual-gamepad.ts` | `resolveInputPlumberVirtualGamepad()` — keep unchanged |
| `product/platform/input/native/button-codes.ts` | InputPlumber-normalized evdev button constants |
| `product/plugins/gamescope/src/launch-companion/policy.ts` | Reference for `gamescopePolicyFromLaunch()`, `decodeGamescopePolicy()`, `foldGamescopePolicy()` |
| `product/plugins/gamescope/src/session/lifecycle-hook.ts` | Reference session lifecycle hook factory pattern |
| `product/plugins/cdp-input-bridge/src/policy.ts` | Current CDP policy (to restructure) |
| `product/plugins/cdp-input-bridge/src/mapping.ts` | Current named-preset mapping (to replace with inline bindings) |
| `product/plugins/cdp-input-bridge/src/session-lifecycle-hook.ts` | Current lifecycle hook (to refactor) |
| `product/plugins/cdp-input-bridge/src/bridge-process.ts` | Current process manager + evtest translator (to generalize) |
| `product/plugins/cdp-input-bridge/packages/korri-cdp-input-bridge/index.ts` | Current Bun CLI entry (to refactor) |
| `product/plugins/yoshis-fabrication-station/index.ts` | YFS plugin — the primary consumer to migrate |
| `product/plugins/index.ts` | Registration of all first-party plugins and lifecycle hook factories |
| `product/services/device/sessiond.ts` | Calls `afterChildRunning`; needs `launchCompanions` threading |
| `product/services/device/sessiond-plugin-composition.ts` | `sessionLifecycleHooksFromEnv()` |
| `out/config-sketches/launch-composition-config-sketch.yaml` | Canonical authored `launch.with` examples |
