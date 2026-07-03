# Product plugin authoring guide

This directory contains Korri's first-party product plugins. Use this guide when adding or modifying plugins so descriptor shape, registration, tests, and package layout stay consistent.

## Scope

- Plugins here are **first-party product modules**, not third-party marketplace packages.
- Stable identity comes from the plugin descriptor: `namespace` + `name` -> `@namespace:name`.
- Do not derive identity from folder names, Nix package names, or display titles.
- Public authored config should use stable provider/plugin ids when a plugin identity is exposed, e.g. `"@korri:gamescope"`.

## Standard layout

Minimal plugin:

```text
product/plugins/<plugin>/
  index.ts
  README.md
  src/
    plugin.ts
    plugin.test.ts
```

Plugin with bundled Nix/build artifacts:

```text
product/plugins/<plugin>/
  flake.nix
  flake.lock
  index.ts
  README.md
  packages/
    <package>/default.nix
    <package>/README.md
  src/
    plugin.ts
    ...feature modules...
```

Rules:

- `index.ts` should be a thin public export surface.
- Put the actual descriptor in `src/plugin.ts`.
- Keep feature code under `src/<feature>/` and re-export from local `index.ts` files when useful.
- Put plugin-owned Nix packages under `packages/`; keep package docs beside the package.

Example `index.ts`:

```ts
export { myPlugin, KORRI_MY_PLUGIN_ID } from "./src/plugin"
```

## Descriptor pattern

Use `plugin(...)` from `@platform/plugin`.

```ts
import { plugin } from "@platform/plugin"

export const KORRI_MY_PLUGIN_ID = "@korri:my-plugin" as const

export const myPlugin = plugin({
  namespace: "@korri",
  name: "my-plugin",
  title: "My Plugin",
  description: "Short product description.",
  contributes: {
    config: {
      modules: {
        "some-module": {
          id: "some-module",
          kind: "example",
          capabilities: ["diagnostics.collect"],
        },
      },
    },
    handlers: [
      {
        id: "my-plugin.diagnostics",
        operation: "diagnostics.collect",
        capabilities: ["diagnostics.collect"],
        run: context => ({ provider: context.provider, input: context.input }),
      },
    ],
  },
})
```

The helper automatically contributes a provider record for the plugin id under `contributes.config.providers` with the plugin title/description. Add explicit provider fields only when needed.

## Config contributions

`contributes.config` may include:

- `providers`
- `providerLinks`
- `storage`
- `systems`
- `apps`
- `modules`
- `runtimes`
- `profiles`
- `catalog`

Registry namespacing behavior matters:

- `providers` are merged as authored keys exactly as supplied. Use stable provider ids.
- Other config maps are namespaced by the registry as `<plugin-id>/<local-id>`.
  - Example local module `neverball` from `@korri:neverball` becomes `@korri:neverball/neverball`.

Use config contributions for static, declarative records. Use handlers for callable behavior.

## Catalog and executable resources

A plugin-contributed game should contribute catalog plus a module/resource when launch needs a fulfilled executable.

Example:

```ts
contributes: {
  config: {
    catalog: {
      neverball: {
        id: "neverball",
        title: "Neverball",
        kind: "game",
        releases: [
          {
            id: "nixpkgs",
            title: "Neverball from nixpkgs",
            launch: {
              kind: "process",
              executable: { resource: "neverball" },
            },
          },
        ],
      },
    },
    modules: {
      neverball: {
        id: "neverball",
        kind: "executable",
        fulfill: {
          provider: "nix",
          installable: "nixpkgs#neverball",
          binary: "neverball",
        },
      },
    },
  },
}
```

Resource/fulfillment rules:

- Do not mutate user Nix profiles.
- Do not use `nix run` at launch time.
- Fulfill resources explicitly before launch, e.g. through the server-only resource fulfillment path.
- Launch resolution should use already fulfilled resources and fail closed if missing.
- Nix must be an explicit host capability/absolute command, not assumed from `PATH`.

## Release discovery providers

First-party plugins may contribute release discovery providers through `contributes.discovery` when the plugin owns knowledge about how local content becomes a launchable release. Providers emit **candidate observations** only; Korri's scanner owns reconciliation, duplicate suppression, identity backfill, first-seen timestamps, and readable YAML persistence.

Rules:

- Keep provider ids stable and plugin-qualified, e.g. `@korri:retroarch/gba-files` or `@korri:steam/installed-apps`.
- For file-backed discovery, consume the scanner-supplied normalized file descriptors. Do not run a second recursive filesystem scan inside the provider.
- Use `file-release` observations when the discovered release target is the file itself. These observations must include plugin-owned app/runtime/system ids so the scanner can render a file target and launch policy.
- Use `provider-ref-release` observations when a local file is evidence for a provider-owned launch identity rather than the launch target. Steam installed-app discovery is the reference shape: the ACF manifest is evidence, but the persisted target is `target: { kind: provider-ref, provider: "@korri:steam", ref: <appid> }`.
- Read manifest/state evidence through the scanner-supplied `context.readText` helper. Providers must remain read-only: no install requests, config mutation, service restarts, localconfig seeding, or direct readable YAML writes during discovery.
- Return observations with identities owned by the plugin; do not write readable config or mutate ProseQL directly.
- Do not include timestamps such as `firstSeenAt` or `discoveredAt`; the scanner applies scan-time metadata when it renders supported candidate metadata. Provider-ref targets currently do not carry first-seen metadata.
- Keep execution bounded and deterministic. Content hashing, title databases, network calls, art scraping, runtime probing, and async background work require a separate scoped plan.
- Future providers that are not driven by scanner-enumerated evidence files should still emit observations and leave persistence to the host, but may need a separate discovery context/factory plan.

Reference implementations:

```text
product/plugins/retroarch/src/discovery.ts       # file-release observations
product/plugins/retroarch/src/discovery.test.ts
product/plugins/steam/src/discovery.ts           # provider-ref-release observations
product/plugins/steam/src/discovery.test.ts
```

## Runtime substrate ownership

- `@korri:fex` owns generic FEX substrate facts and defaults. FEX consumers should import default FEX path facts from the FEX runtime plugin or source the `korri-fex-runtime` setup helper; do not import Steam path constants for FEX rootfs defaults.
- `@korri:proton` owns Proton runtime defaults. Windows/FEX game wrappers should source `korri-proton-runtime` and let that helper provide the default Proton root unless the app exposes an explicit override.
- `@korri:steam` owns Steam AppID launch, install authority, service envelope, Steam Runtime / pressure-vessel repair, Proton patching for Steam launches, visibility policy, and AppID cleanup. Do not move Steam runtime-prep into `@korri:fex` just because the current FEX rootfs is physically provisioned under Steam state.

## Launch companions and wrappers

For launch-environment functionality like Gamescope:

- Keep the public config participant id stable, e.g. `"@korri:gamescope"`.
- Descriptor/config should declare generic capabilities such as `launch.compose` and `launch.wrapper`.
- Callable wrapping behavior belongs behind a handler, commonly operation `launch.compose`.
- Do not expose low-level implementation flags that are app-specific internals. For Steam/Gamescope, Steam-session behavior (`-e`) stays internal.
- Temporary internal compatibility is allowed: resolver/runtime may continue normalizing to legacy internal fields while authored config uses `launch.with."@korri:gamescope"`.

Gamescope is the reference implementation:

```text
product/plugins/gamescope/
  index.ts
  src/plugin.ts
  src/launch-companion/
  src/runtime-control/
  src/stream-control/
  src/session/
  src/cli/
  packages/
```

## Handlers

Handler operations are app-agnostic and operation-scoped.

Use the operation vocabulary from `@platform/plugin` when possible:

- `catalog.list`
- `launch.prepare`
- `launch.compose`
- `runtime.resolve`
- `stream-control.apply`
- `stream-control.describe`
- `session.cleanup`
- `package.expose`
- `cli.expose`
- `artifact.resolve-download`
- `diagnostics.collect`

Handler rules:

- Validate `context.input` at the handler boundary.
- Return plain values, promises, or `Effect`; the host normalizes them.
- Keep handler ids stable and namespaced, e.g. `gamescope.launch-compose`.
- Include `capabilities` on handlers when they implement declared capabilities.

## Registration

This directory is a pure plugin catalog: each plugin is a folder. The host-side
first-party registry that aggregates these plugins lives outside the catalog.

Register first-party plugins in:

```text
product/plugin-host/index.ts
```

The registry imports plugins by alias (it no longer sits inside this directory):

```ts
import { gamescopePlugin, KORRI_GAMESCOPE_PLUGIN_ID } from "@product/plugins/gamescope"
import { neverballPlugin } from "@product/plugins/neverball"

export const firstPartyPlugins = [gamescopePlugin, neverballPlugin] as const
```

Enablement rules:

- Catalog/content plugins may be gated by `KORRI_ENABLED_PLUGINS`.
- Core infrastructure plugins that authored config depends on, such as `@korri:gamescope`, should be enabled by default unless the product explicitly supports disabling them.
- If adding a default-enabled infrastructure plugin, update `enabledFirstPartyPluginIds(...)` and tests.

## Tests

Every plugin should have focused tests for:

- stable plugin id;
- descriptor config contributions;
- handler operation list;
- handler input validation;
- registry exposure if adding new contribution surfaces;
- discovery-provider behavior if adding `contributes.discovery`;
- launch/catalog/resource behavior if applicable.

Recommended test locations:

```text
product/plugins/<plugin>/src/plugin.test.ts
product/plugins/<plugin>/src/<feature>/*.test.ts
product/platform/plugin/registry.test.ts
```

Run targeted tests before broader suites, for example:

```sh
bun test \
  product/plugins/<plugin>/src/plugin.test.ts \
  product/platform/plugin/registry.test.ts
```

If the plugin affects launch resolution, also run the relevant config/launch tests.

## Do not do in a plugin slice unless explicitly scoped

- Do not migrate unrelated authored config shapes.
- Do not introduce marketplace or third-party loading semantics.
- Do not add sandbox/trust-boundary claims for first-party plugins.
- Do not add broad provider/app-instance modeling unless the task is specifically about that.
- Do not assume a plugin's folder name is its identity.
- Do not rely on `PATH` for host capabilities that must be deterministic.
