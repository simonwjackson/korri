---
title: Korri product platform and autonomous theme architecture
date: 2026-06-03
category: architecture-patterns
module: repo-structure + theme-platform-boundary
status: proposed
problem_type: architecture_direction
component: product-architecture
severity: medium
applies_when:
  - Reorganizing the Korri monorepo around product ecosystem roles
  - Moving shipped runtime code out of developer-only tools
  - Designing first-party themes so they can become third-party themes later
  - Separating framework-neutral platform APIs from React-specific helpers
tags: [repo-structure, themes, platform, plugins, apps, services, systems]
---

# Korri product platform and autonomous theme architecture

## Context

Korri's current tree mixes several organizing axes: product app code, shared runtime code, deploy entrypoints, shipped device programs, developer tools, Nix packaging, and first-party themes. The result makes it unclear which code is product runtime, which code is developer-only tooling, and which surfaces are meant to become third-party/extensible experiences.

The target direction is to organize the monorepo around product ecosystem roles instead of build-tool or framework details.

Core principle:

> Themes are autonomous web applications running on the Korri platform. Korri provides capabilities, not experience structure.

A theme may be React, Vue, Svelte, plain JavaScript, or anything else that can be loaded as a web page. React remains a supported adapter with useful shared pieces, but React is not the platform boundary.

## Proposed top-level shape

```text
product/
  platform/
  themes/
  apps/
  services/
  systems/
  vendor/
tools/
docs/
backlog/
out/
old-ui/
flake.nix
justfile
package.json
tsconfig.json
```

## Folder contracts

### `product/platform/`

The public Korri API exposed to themes and product apps. This is not a miscellaneous shared-code bucket; it is the stable surface external and first-party experiences build against.

Suggested internal shape:

```text
product/platform/
  protocol/   # framework-neutral schemas, wire types, RPC contracts, typed errors
  browser/    # framework-neutral browser SDK over the protocol
  input/      # semantic input event contract and browser helpers
  ui/         # framework-neutral CSS tokens/assets/primitives
  react/      # optional React adapter: hooks, atoms, roots, state components
```

Rules:

- `platform/protocol` must not depend on React.
- `platform/browser` must not depend on React.
- `platform/input` must expose semantic input concepts independent of the physical device.
- `platform/ui` should be framework-neutral unless a subfolder explicitly says otherwise.
- `platform/react` may depend on React and on lower platform layers.
- React is an adapter, not the platform.

### `product/themes/`

Autonomous web experiences. A theme owns its own homepage, workflow, routing model, framework choice, layout, visual system, local state, and theme-specific tests/stories.

Examples:

```text
product/themes/shift/          # full launcher experience
product/themes/evier/          # operator/control experience
product/themes/single-game/    # one-game appliance experience
product/themes/kids-mode/      # device-specific workflow
```

A theme should be extractable into another repo. It may import platform APIs, but it must not import app/service/system internals.

Allowed dependencies:

```text
product/platform/protocol
product/platform/browser
product/platform/input
product/platform/ui
product/platform/react   # only when the theme chooses React
```

Forbidden dependencies:

```text
product/apps/*
product/services/*
product/systems/*
another theme's internals
private implementation files not exposed through platform
```

Important: a theme is not a route manifest or a collection of host-owned pages. It is the experience. The shell/container loads the selected theme entrypoint and gives it platform capabilities; the theme decides what happens inside.

### `product/apps/`

Concrete shells/userspace apps that users, operators, or developers can run.

Examples:

```text
product/apps/portal/      # browser/web container that loads the selected theme
product/apps/desktop/     # Electrobun wrapper around the portal/theme runtime
product/apps/storybook/   # visual harness for first-party themes/platform UI
product/apps/cli/         # operator CLI, if it is user/operator-facing
```

`apps/portal` should be a thin web container. It knows how to boot the selected theme and expose the platform bridge. It should not know theme routes, home layout, panels, or workflow.

`apps/desktop` handles desktop/native wrapper concerns, including Electrobun, runtime config injection, API forwarding, windows, and translation from native input devices into platform semantic input events.

### `product/services/`

Long-running runtime processes and device/server daemons.

Examples:

```text
product/services/server/
product/services/sessiond/
product/services/inputd/
product/services/game-stream-runner/
product/services/gamescope-control-bridge/
```

Rule:

> If Nix packages it, a device runs it, or users/operators invoke it as part of Korri, it does not live in `tools/`.

### `product/systems/`

Complete product/system compositions: images, root filesystems, payloads, and device/system profiles.

Examples:

```text
product/systems/live-usb/
product/systems/rocknix-product-payload/
product/systems/rocknix-rootfs/
product/systems/source-machine/
product/systems/desktop-lab/
```

Nix is an implementation detail of these product concepts. Prefer Nix files beside the thing they package or compose, for example:

```text
product/apps/portal/package.nix
product/services/server/package.nix
product/systems/live-usb/image.nix
```

The root `flake.nix` can remain the repo entrypoint that wires those product units together.

### `product/vendor/`

Carried upstream or patched external/native code used by the product.

Examples:

```text
product/vendor/gamescope-korri/
product/vendor/moonlight-embedded-korri/
product/vendor/SDL2-mali-fbdev/
product/vendor/sunshine-korri/
product/vendor/libretro-fake-08/
```

These are product dependencies, but not conceptually Korri-authored platform/app/theme code.

### `tools/`

Developer-only automation: generators, test harnesses, Playwright config, demo capture helpers, importers, feature-map explorer, and local scripts.

Hard rule:

> `tools/` is never delivered.

If something under `tools/` is packaged into a product artifact, it should move under `product/apps`, `product/services`, or `product/systems`.

## Theme loading contract

A theme is loaded as a web page or web bundle. The container provides a platform bridge. The theme decides what to do.

Conceptual shape:

```ts
// Theme-owned entrypoint.
mountTheme(document.getElementById("app"), platform)
```

Or plain browser style:

```js
window.addEventListener("korri:input", event => {
  // The theme decides what confirm/back/direction means.
})

const games = await window.korri.library.list()
```

Any theme metadata should be minimal install/build metadata, not a route/workflow manifest.

Acceptable:

```ts
{
  id: "shift",
  name: "Shift",
  version: "0.1.0",
}
```

Avoid:

```ts
{
  routes: [
    { path: "/", component: ShiftHomePage },
  ],
}
```

Routes and workflows are theme internals.

## Platform bridge contract

Framework-neutral first:

- `fetch` / RPC over HTTP
- browser events such as `CustomEvent`
- `BroadcastChannel` where appropriate
- `postMessage` if themes are later sandboxed or iframe-hosted
- optional `window.korri` convenience API

Framework adapters second:

```text
product/platform/react/
  useLibraryItems
  useInputAction
  atoms/layers
  state components
  React UI primitives
```

A React theme gets leverage from existing shared React pieces. A non-React theme can still use the platform through browser APIs.

## Dependency direction

Desired direction:

```text
product/apps/portal      -> product/platform
product/apps/desktop     -> product/apps/portal
product/themes/*         -> product/platform
product/platform/react   -> product/platform/browser + product/platform/protocol
product/services/*       -> product/platform/protocol
product/systems/*        -> product/apps + product/services + product/vendor
```

Forbidden direction:

```text
product/platform   -X-> product/themes
product/platform   -X-> product/apps
product/themes     -X-> product/apps
product/themes     -X-> product/services
product/themes     -X-> product/systems
tools              -X-> shipped runtime dependency
```

## Current-code implications

This direction implies several future migrations:

- Move shipped code currently under `tools/cli`, `tools/device`, and `tools/http` into `product/apps` or `product/services`.
- Move current shared runtime contracts into `product/platform`, separating framework-neutral protocol/browser/input layers from React-specific adapters.
- Move first-party theme code from shared theme folders into `product/themes/<theme>`.
- Keep `apps/portal` and `apps/desktop` thin: they load a selected theme and expose platform capabilities; they do not own the experience.
- Move Nix package/image/module files beside the product unit they build where practical, with `flake.nix` remaining as the composition entrypoint.

## Summary

```text
product/platform = what Korri exposes
product/themes   = autonomous web experiences
product/apps     = containers/shells/userspace apps
product/services = runtime daemons
product/systems  = image/system compositions
product/vendor   = carried upstream code
tools            = developer-only automation
docs             = durable knowledge
```

The design principle to preserve:

> Korri should provide capabilities, not prescribe experience structure. Themes own the experience.
