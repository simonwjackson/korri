---
id: task-059
title: Move Moonlight platform defaults into readable policy
status: In Progress
priority: high
labels:
  - moonlight
  - nix
  - platform-defaults
  - readable-config
created: 2026-06-08
source: se-plan
context:
  cwd: .
  branch: trunk
  commit: eabfc08
  repo: simonwjackson/korri
  invoked_by: user
---

# Move Moonlight platform defaults into readable policy

## Why it matters

Chunk C removes service-env launch defaults and makes platform-owned Moonlight behavior visible in the readable library policy. It is isolated because it spans NixOS modules, generated config, and Nix checks rather than TypeScript renderer design alone.

## Acceptance Criteria

- [ ] A shared platform-default readable YAML fragment mechanism exists or is reused; it can render `host.moonlight` defaults for platform modules.
- [ ] SM8550 platform defaults render Moonlight command, platform name derived from `sm8550.video.decodeBackend`, mapping file, touch defaults, auto-window-resize, and local-control authority into readable policy.
- [ ] x86 platform defaults render Moonlight command/mapping policy without relying on `KORRI_MOONLIGHT_*` service env.
- [ ] Before service env blocks are edited, every current `MOONLIGHT_SEND_RUNTIME_SETTINGS_MVP_*` and `MOONLIGHT_RUNTIME_SETTINGS_MVP_*` location is enumerated and either preserved as service env or typed as an explicitly experimental one-shot launch hook; working SM8550 behavior is not silently removed.
- [ ] Deprecated launch-policy env vars (`KORRI_MOONLIGHT_COMMAND`, `KORRI_MOONLIGHT_CLIENT`, `KORRI_MOONLIGHT_PLATFORM`, `KORRI_MOONLIGHT_MAPPING_FILE`, `KORRI_MOONLIGHT_ABSOLUTE_TOUCH*`, `KORRI_MOONLIGHT_AUTO_WINDOW_RESIZE`, `KORRI_MOONLIGHT_CONTROL*`) are removed from platform service env once policy replacements are wired.
- [ ] Existing positive Nix assertions for deprecated `KORRI_MOONLIGHT_*` vars are converted into readable-fragment assertions plus absent-env assertions in the same slice.
- [ ] Nix checks prove generated platform fragments are loaded by ProseQL/readable library resolution and can render complete Moonlight launch policy without user-authored `library.yaml` Moonlight fields.
- [ ] Any remaining Moonlight env, such as state-home or runtime spike env, is documented as non-policy scope with tests/notes explaining why it remains.

## Related

- `docs/plans/2026-06-08-002-feat-typed-moonlight-policy-api-plan.md`
- `product/systems/nixos/modules/korri-server.nix`
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- `product/systems/nixos/images/platforms/x86.nix`
- `product/systems/nixos/images/kiosk.nix`
- `product/systems/nixos/images/live-usb-runtime.nix`
- `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
- `tools/testing/nix/korri-live-usb-config-check.nix`

## Notes

Agentic Chunk C from the plan. Covers U5. Prerequisites: Chunk A and B should be landed; if the typed Gamescope plan already added the platform-default fragment mechanism, reuse it rather than creating a Moonlight-only mechanism. Keep true service/session env separate from launch policy: Wayland/session identity, Gamescope bridge env, and unresolved runtime spike env are not automatically migrated.
