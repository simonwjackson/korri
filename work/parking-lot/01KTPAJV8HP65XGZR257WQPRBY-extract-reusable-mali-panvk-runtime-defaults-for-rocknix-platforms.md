---
id: 01KTPAJV8HP65XGZR257WQPRBY
slug: extract-reusable-mali-panvk-runtime-defaults-for-rocknix-platforms
title: "Extract reusable Mali/PanVK runtime defaults for RockNix platforms"
origin: parked
legacy: backlog/task-036
status: To Do
priority: medium
labels:
  - "product"
  - "config"
  - "gamescope"
  - "architecture"
  - "nix"
created: 2026-06-07
source: user
---

# Extract reusable Mali/PanVK runtime defaults for RockNix platforms

## Context

The typed Gamescope policy work has already removed the old launch-policy part of
this task:

- Platform launch defaults now flow through readable YAML via
  `services.korri.server.library.platformDefaults`.
- RK3566 now expresses the RetroArch Xwayland routing as readable policy:
  `apps.retroarch.gamescope.app.environment.WAYLAND_DISPLAY = null`.
- The old `forceXwayland` field and `KORRI_GAMESCOPE_FORCE_XWAYLAND` fallback are
  no longer the right direction.

The remaining problem is the **runtime service environment** needed by
Mali/PanVK RockNix devices. `rocknix-rk3566.nix` still defines device-specific
Panfrost/wlroots and nested Gamescope environment maps inline, then wires them
manually into the compositor and sessiond services.

Today this includes values such as:

- Panfrost/wlroots compositor defaults:
  - `WLR_DRM_DEVICES`
  - `WLR_RENDER_DRM_DEVICE`
  - `WLR_RENDERER`
  - `WLR_NO_HARDWARE_CURSORS`
  - `WLR_LIBINPUT_NO_DEVICES`
  - `MESA_LOADER_DRIVER_OVERRIDE`
  - `GALLIUM_DRIVER`
- Mali/PanVK nested Gamescope runtime defaults:
  - `PAN_I_WANT_A_BROKEN_VULKAN_DRIVER`
  - `MESA_VK_VERSION_OVERRIDE`
  - `VK_DRIVER_FILES`
  - `GAMESCOPE_DISABLE_PIPELINE_PRECOMPILE`
  - `GAMESCOPE_DISABLE_EXPLICIT_SYNC`

These are still valid runtime requirements, but they should be reusable
product/device-class defaults instead of one-off inline maps in each platform
file.

## Why it matters

The typed policy API now handles launch-time intent cleanly. The remaining risk
is operational drift: every Mali/PanVK RockNix device that needs the same runtime
knobs would currently copy/paste environment blocks and service wiring. That is
hard to audit and easy to update inconsistently.

A reusable Nix-level defaults surface would keep platform files thin, make the
Mali/PanVK assumptions explicit, and let a future second Mali/PanVK device opt
into the same environment bundle without duplicating RK3566-specific code.

## Acceptance Criteria

- [ ] Add a reusable Nix module/helper/profile for Mali/PanVK RockNix runtime
      defaults, covering the currently inline Panfrost/wlroots compositor env
      and nested Gamescope PanVK env.
- [ ] `rocknix-rk3566.nix` consumes that reusable surface instead of defining the
      full environment maps inline.
- [ ] The reusable surface can be consumed by a hypothetical second Mali/PanVK
      platform without copy/pasting the same env attrsets.
- [ ] The service wiring remains explicit about where each env applies:
      compositor env vs sessiond/nested-Gamescope env. Do not hide app launch
      policy in process env.
- [ ] RK3566 keeps its readable launch policy default through
      `services.korri.server.library.platformDefaults`, including
      `apps.retroarch.gamescope.app.environment.WAYLAND_DISPLAY = null`.
- [ ] Add or update Nix config checks proving RK3566 still receives the required
      runtime env and readable platform-default policy.
- [ ] `pkgs.gamescope` overlay remains the always-on `gamescope-korri`; no
      regression for SM8550/Thor/Odin2 native-Wayland behaviour.

## Out of Scope / Already Done

- Do not reintroduce `forceXwayland`.
- Do not reintroduce `KORRI_GAMESCOPE_FORCE_XWAYLAND` or any equivalent hidden
  launch-policy env fallback.
- Do not add a public `gamescope.cli` or raw-args compatibility layer.
- Do not redesign the typed readable Gamescope policy schema; that landed in the
  typed policy work.

## Related

- `product/systems/nixos/images/platforms/rocknix-rk3566.nix`
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- `product/systems/nixos/modules/korri-server.nix`
- `product/systems/nixos/modules/korri-sessiond.nix`
- `tools/testing/nix/korri-rocknix-rk3566-config-check.nix`
- `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
- Completed typed policy work: `eabfc08 feat(gamescope): replace policy with typed readable API`

## Notes

Promote to planning before implementation. The main design choice is where the
reusable defaults should live: a small RockNix platform helper, a NixOS module
option, or a device-class profile imported by Mali/PanVK platforms.
