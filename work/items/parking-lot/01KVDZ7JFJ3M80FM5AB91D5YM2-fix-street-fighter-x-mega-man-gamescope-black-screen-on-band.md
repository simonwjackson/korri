---
id: 01KVDZ7JFJ3M80FM5AB91D5YM2
slug: fix-street-fighter-x-mega-man-gamescope-black-screen-on-band
title: Fix Street Fighter X Mega Man Gamescope black screen on Bandai
origin: parked
status: To Do
priority: high
labels:
  - korri
  - bandai
  - sfxmm
  - gamescope
  - wine
  - display
created: 2026-06-18
source: se-compound
context:
  cwd: /home/simonwjackson/code/sandbox/korri/.worktrees/feat/street-fighter-x-mega-man-trunk
  branch: feat/street-fighter-x-mega-man-trunk
  repo: korri
  invoked_by: user
---

# Fix Street Fighter X Mega Man Gamescope black screen on Bandai

## Why it matters

SFXMM is now integrated as a first-party Korri playable and the Wine Pulse registry issue is fixed, but managed launches still present a black Gamescope surface because the game window is not becoming focusable/visible. Leaving this captured prevents losing the detailed local runtime investigation and keeps future work scoped to the remaining display/focus problem rather than repeating reverted Wine backend experiments.

## Acceptance Criteria

- [ ] Managed `app.library.launch` for `@korri:street-fighter-x-mega-man/street-fighter-x-mega-man` stays alive past startup under `gamescope-korri`.
- [ ] A Bandai screenshot shows visible Street Fighter X Mega Man gameplay rather than a black surface.
- [ ] PipeWire/Pulse sink input is present during gameplay and no "No sound device detected" dialog appears.
- [ ] Gamescope focus/focusable-window state or an equivalent presentation signal identifies the SFXMM window correctly.
- [ ] Failed experiments remain excluded: no `env -u DISPLAY`, no `env -u WAYLAND_DISPLAY`, and no Wine `Graphics=x11`/`x11,wayland` override in the final policy.

## Related

- `product/plugins/street-fighter-x-mega-man/src/plugin.ts`
- `product/plugins/street-fighter-x-mega-man/packages/street-fighter-x-mega-man/street-fighter-x-mega-man-fex`
- `product/plugins/street-fighter-x-mega-man/packages/street-fighter-x-mega-man/check.nix`
- `docs/solutions/runtime-errors/street-fighter-x-mega-man-wine-registry-key-escaping-2026-06-18.md`

## Notes

Current stable dry-run on Bandai should remain `/run/current-system/sw/bin/gamescope --backend wayland -f -b --expose-wayland -- .../street-fighter-x-mega-man`. Audio registry key quoting is fixed separately; remaining blocker is visual presentation/focus under Gamescope. Prior failed/reverted paths: unset WAYLAND_DISPLAY, unset DISPLAY + Wine native Wayland, Wine virtual desktop, explicit Gamescope geometry/force-fullscreen, and Wine Graphics registry overrides.
