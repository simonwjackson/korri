---
id: task-036
title: Add product-level config defaults so platforms inherit gamescope policy + service env
status: To Do
priority: medium
labels:
  - product
  - config
  - gamescope
  - architecture
  - nix
created: 2026-06-07
source: user
context:
  cwd: .
  branch: trunk
  repo: simonwjackson/korri
  invoked_by: user
---

# Add product-level config defaults so platforms inherit gamescope policy + service env

## Context

Bringing up RG353M (RK3566 / Mali-G52) required hand-writing a gamescope runtime
env block into the platform file
`product/systems/nixos/images/platforms/rocknix-rk3566.nix`:

- PanVK enablement (`PAN_I_WANT_A_BROKEN_VULKAN_DRIVER`, `MESA_VK_VERSION_OVERRIDE`,
  `VK_DRIVER_FILES`) + `GAMESCOPE_DISABLE_{PIPELINE_PRECOMPILE,EXPLICIT_SYNC}`
- `KORRI_GAMESCOPE_FORCE_XWAYLAND=1`

…and wiring it onto `services.korri.sessiond.extraEnvironment` **and**
`systemd.services.korri-server.environment` by hand. `forceXwayland` is already a
first-class `GamescopePolicy` field (`product/platform/library/config/inheritable-fields.ts`),
but the device's *default* is currently injected as an env var in two places
rather than as a product-scoped policy/env default that platforms inherit.

The user wants: "this device should have these enabled via the config by default"
— a product/policy-level defaults system so a product (or device class) declares
its defaults once and platforms inherit them, instead of repeating env blocks.

## Why it matters

Hand-setting per-platform systemd env is error-prone and doesn't scale. Doing it
for RG353M cost a branch-divergence trap (the code that reads the flag was on
trunk while the platform default was on a feature branch) and a misleading env
name (`KORRI_GAME_STREAM_GAMESCOPE_FORCE_XWAYLAND`, later renamed). Each new
device that needs gamescope-on-Mali — or any device-class default — would repeat
the same two-place wiring. A declarative product-defaults surface keeps platform
files thin, makes the default gamescope policy config-driven and unit-testable
(via the policy cascade) instead of an env string, and lets future Mali/PanVK
devices reuse one bundle.

## Acceptance Criteria

- [ ] A product/platform can declare default `GamescopePolicy` (including
      `forceXwayland: true`) that flows into the resolved launch policy cascade,
      so the local UI launch (`launch.rpc-handler`) picks it up from config — not
      only from the `KORRI_GAMESCOPE_FORCE_XWAYLAND` env fallback.
- [ ] A product/platform can declare runtime service-env defaults (the PanVK vars)
      once, without hand-writing both `sessiond.extraEnvironment` and
      `systemd.services.korri-server.environment`.
- [ ] `rocknix-rk3566.nix` no longer hand-sets the gamescope env block inline; it
      references the product-defaults surface (e.g. a reusable `mali-panvk-gamescope`
      defaults bundle / device-class preset).
- [ ] A hypothetical second Mali/PanVK device reuses the same defaults without
      copy-paste.
- [ ] Unit coverage that the declared product default actually reaches
      `composeGamescopeLaunchSpec` (e.g. forceXwayland routing) via the cascade.
- [ ] `pkgs.gamescope` overlay remains the always-on gamescope-korri (no regression
      for SM8550/Thor/Odin2 native-Wayland behaviour).

## Related

- `product/systems/nixos/images/platforms/rocknix-rk3566.nix`
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- `product/platform/library/config/inheritable-fields.ts` (`GamescopePolicy`, `DEFAULT_GAMESCOPE_POLICY`)
- `product/platform/stream/gamescope-launch-spec.ts` (`composeGamescopeLaunchSpec`, env fallback)
- `product/apps/portal/api/library/launch.rpc-handler.ts` (policy → options)
- `product/systems/nixos/modules/korri-{server,sessiond}.nix` (service env seams)
- Adjacent boundary work: `task-035` (move product package/source assembly behind `product.packages`) — different concern (build topology vs runtime config defaults), but the same `./product` boundary may host both.

## Notes

Open design question for se-plan: is the right surface (a) a `DEFAULT_GAMESCOPE_POLICY`
override keyed per product, (b) a NixOS-level `services.korri.product.defaults`
option that fans out env + seeds the policy floor, or (c) a "device capabilities"
concept (device declares `mali-panvk`/`needs-xwayland`; each layer maps to concrete
defaults). Promote to se-plan before implementing — it's architectural and spans
the TS policy cascade + the NixOS product modules.
