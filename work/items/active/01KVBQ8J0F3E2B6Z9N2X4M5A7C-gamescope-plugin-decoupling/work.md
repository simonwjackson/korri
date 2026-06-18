---
id: 01KVBQ8J0F3E2B6Z9N2X4M5A7C
title: Remove Gamescope conceptual coupling from Korri
status: active
created: 2026-06-17
source: direct-user-request
origin: work/items/active/01KV8NZRAAETDX69P5T73BRVY8-first-party-plugin-system-shape/requirements.md
supersedes:
  - work/items/active/01KVAW869GW82T1WA01GNJHB18-colocate-gamescope-launch-companion-behavior-in-plugin/plan.md
  - work/items/active/01KVBE3W1NTB209YDWBPGC0DBV-plugin-descriptor-sketch-alignment/plan.md
---

# Remove Gamescope conceptual coupling from Korri

Fresh follow-up plan for making Gamescope a plugin-owned implementation detail while Korri platform/core/services/apps/themes/generic Nix surfaces remain conceptually agnostic.

## Progress

- 2026-06-17: U7 documentation/config-example pass completed. Added the durable architecture note for Gamescope as plugin-owned composition and updated readable examples to describe `launch.with."@korri:gamescope"` as plugin composition rather than a core or Moonlight field.
- 2026-06-18: U8 local implementation completed and reviewed. Verified generic Korri layers are Gamescope-string-free outside explicit composition files, production entrypoints receive enabled plugin registries/hooks, and disabled/no-op launch companions do not trigger fullscreen repair.
