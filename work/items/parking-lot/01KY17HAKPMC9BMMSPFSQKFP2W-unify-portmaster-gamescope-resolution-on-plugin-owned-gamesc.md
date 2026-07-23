---
id: 01KY17HAKPMC9BMMSPFSQKFP2W
slug: unify-portmaster-gamescope-resolution-on-plugin-owned-gamesc
title: Unify PortMaster gamescope resolution on plugin-owned gamescope-korri
origin: parked
status: To Do
priority: medium
labels:
  - gamescope
  - portmaster
  - touch
created: 2026-07-21
source: se-debug
---

# Unify PortMaster gamescope resolution on plugin-owned gamescope-korri

## Why it matters

PortMaster's gamescope presentation mode resolves `gamescope` from PATH (envelope.ts:642), a third resolution mechanism besides the launch companion and the Steam service. Whichever binary PATH exposes may lack Korri's patch series (render-only Vulkan device, explicit-sync opt-out, wl_touch forwarding), so touch-driven ports would silently regress the same way Steam did.

## Acceptance Criteria

- [ ] PortMaster gamescope launches use the gamescope-korri package (explicit path, not bare PATH lookup) or the platform provides gamescope-korri as the only gamescope on PATH with a config-check assertion
- [ ] A test asserts the resolved gamescope for PortMaster carries the korri patch series

## Related

- `product/plugins/portmaster/src/envelope.ts`
- `product/plugins/gamescope/packages/gamescope-korri/default.nix`
