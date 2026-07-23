---
id: 01KY5AHVF448SEN1CWK4C69JD9
slug: repair-stale-compositor-module-gamescope-path-assertion
title: Repair stale compositor-module Gamescope PATH assertion
origin: parked
status: To Do
priority: medium
labels:
  - tests
  - gamescope
  - compositor
created: 2026-07-22
source: se-debug
context:
  cwd: /home/simonwjackson/code/sandbox/korri
  branch: trunk
  commit: 2e1cdaaf
  repo: korri
---

# Repair stale compositor-module Gamescope PATH assertion

## Why it matters

The generic `korri-compositor-module` check fails on clean commit 2e1cdaaf because it expects Gamescope on the compositor PATH even though plugin decoupling moved that wiring to the Gamescope plugin module. This pre-existing RED check obscures unrelated compositor changes.

## Acceptance Criteria

- [ ] `nix build .#checks.x86_64-linux.korri-compositor-module --no-link` passes on an otherwise clean tree.
- [ ] The assertion validates Gamescope PATH wiring at the plugin-composition seam rather than the generic compositor module.

## Related

- `tools/testing/nix/korri-compositor-module-check.nix`
- `product/plugins/gamescope/nix/nixos-module.nix`
