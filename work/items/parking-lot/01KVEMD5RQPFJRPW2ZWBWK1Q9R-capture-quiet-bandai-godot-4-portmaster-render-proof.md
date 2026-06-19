---
id: 01KVEMD5RQPFJRPW2ZWBWK1Q9R
slug: capture-quiet-bandai-godot-4-portmaster-render-proof
title: Capture quiet Bandai Godot 4 PortMaster render proof
origin: parked
status: To Do
priority: medium
labels:
  - portmaster
  - bandai
  - validation
created: 2026-06-19
source: se-work
context:
  cwd: /tmp/korri-portmaster-godot4
  branch: feat/portmaster-godot4-runtime
  commit: ddd32251
  repo: korri
---

# Capture quiet Bandai Godot 4 PortMaster render proof

## Why it matters

The new Godot 4 + Weston runtime packages reached packaged Weston/Xwayland startup on Bandai, but unrelated main-space restart activity interrupted final Godot render observation. A quiet-session rerun will close the validation gap before relying on this path broadly.

## Acceptance Criteria

- [ ] Run mrplatformer.zip through the generated PortMaster install/envelope using portmaster-godot-4-2-runtime and portmaster-weston-runtime on Bandai.
- [ ] Observe a live godot422.aarch64 process or successful exit with no missing-library errors.
- [ ] Capture a screenshot or log proof of the Godot port rendering through gamescope/Weston.

## Related

- `product/plugins/portmaster/packages/portmaster-godot-4-2-runtime/default.nix`
- `product/plugins/portmaster/packages/portmaster-weston-runtime/default.nix`
- `work/items/parking-lot/01KVDXP0A4DKSQY78KYY84XEAP-portmaster-plugin-compatibility-substrate-brief.md`
