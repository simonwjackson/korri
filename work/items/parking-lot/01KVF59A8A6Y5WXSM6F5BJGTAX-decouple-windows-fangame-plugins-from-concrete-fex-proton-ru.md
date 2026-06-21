---
id: 01KVF59A8A6Y5WXSM6F5BJGTAX
slug: decouple-windows-fangame-plugins-from-concrete-fex-proton-ru
title: Decouple Windows fangame plugins from concrete FEX/Proton runtime requirements
origin: parked
status: To Do
priority: medium
labels:
  - plugins
  - runtime-boundary
  - windows-fangames
  - fex
  - proton
created: 2026-06-19
source: user
context:
  cwd: /home/simonwjackson/code/sandbox/korri
  branch: trunk
  repo: korri
---

# Decouple Windows fangame plugins from concrete FEX/Proton runtime requirements

## Why it matters

Current MFGG-style game plugins such as smb-wonderland-1987 hard-require FEX, Proton, and Proton-GE at the plugin boundary. That works for Sobo today but bakes one device/runtime strategy into the content plugin, making future runtime selection, x86 hosts, Wine-only paths, and alternate compatibility layers harder to model cleanly.

## Acceptance Criteria

- [ ] Windows fangame content plugins declare payload/platform traits such as Windows i386 executable and required mutable run directory instead of concrete runtime plugins.
- [ ] Runtime/profile selection composes FEX+Proton-GE for Sobo/SM8550 outside the content plugin boundary.
- [ ] Fallback/runtime alternatives are represented as launch profiles or policy, not unconditional plugin requirements.
- [ ] Existing smb-wonderland-1987, psycho-waluigi, and midas-machine behavior remains launchable after migration.

## Related

- `product/plugins/smb-wonderland-1987/src/plugin.ts`
- `product/plugins/psycho-waluigi/src/plugin.ts`
- `product/plugins/midas-machine/src/plugin.ts`
- `product/platform/library/config`
- `product/platform/plugin`
