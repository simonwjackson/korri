---
id: 01KVC8NBN0WS1N5KN4CH37D2WK
slug: extract-reusable-windowsgamepackage-nix-helper
title: Extract reusable windowsGamePackage Nix helper
origin: parked
status: To Do
priority: medium
labels:
  - follow-up
  - nix
  - plugins
  - windows-games
created: 2026-06-18
source: user
context:
  cwd: /home/simonwjackson/code/sandbox/korri/.worktrees/feat/megaman-arena-vendor
  branch: feat/megaman-arena-vendor
  repo: simonwjackson/korri
---

# Extract reusable windowsGamePackage Nix helper

## Why it matters

Adding similar standalone Windows games still requires hand-written Nix packaging and launcher boilerplate for payload copying, FEX/Proton setup, checks, and smoke expectations. A shared helper would turn Mega Man Arena-style game onboarding into a repeatable, lower-risk template instead of bespoke package code.

## Acceptance Criteria

- [ ] A Nix helper can package a standalone Windows game payload from a fetched archive with configurable executable name, version, source hash, and runtime metadata.
- [ ] The helper emits standard launchers for x86_64 Wine and aarch64 FEX/Proton with opt-in Proton-GE support where applicable.
- [ ] Existing Mega Man Arena packaging can be expressed through the helper without losing current checks or Bandai smoke behavior.
- [ ] Package checks cover payload shape, launcher contracts, provenance manifest, and runtime integration points.

## Related

- `product/plugins/mega-man-arena/packages/mega-man-arena/default.nix`
- `product/plugins/mega-man-arena/packages/mega-man-arena/mega-man-arena-fex`
- `product/plugins/fex-runtime/packages/fex-runtime/setup-env`
- `product/plugins/proton-runtime/packages/proton-runtime/setup-env`
- `product/plugins/proton-ge-runtime/packages/proton-ge-runtime/setup-env`

## Notes

Discovered after Mega Man Arena proved the reusable shape: standalone Windows payload copied into writable run dir, default Proton 10 control path, optional GE proton-script path under FEX, and shared FEX runtime setup.
