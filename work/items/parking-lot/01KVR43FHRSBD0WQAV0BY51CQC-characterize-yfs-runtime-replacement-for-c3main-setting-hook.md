---
id: 01KVR43FHRSBD0WQAV0BY51CQC
slug: characterize-yfs-runtime-replacement-for-c3main-setting-hook
title: Characterize YFS runtime replacement for c3main setting hooks
origin: parked
status: To Do
priority: medium
labels:
  - yfs
  - maintainability
  - runtime-injection
created: 2026-06-22
source: se-plan
context:
  cwd: /home/simonwjackson/code/sandbox/korri
  branch: trunk
  repo: korri
  invoked_by: se-plan
---

# Characterize YFS runtime replacement for c3main setting hooks

## Why it matters

The viewport/zoom slice should freeze generated-code patching, but the existing YFS settings still rely on patching generated Construct event code. A separate bounded spike can determine whether those settings can move into owned runtime scripts without destabilizing boot timing or upstream upgradeability.

## Acceptance Criteria

- [ ] Document whether runtime Dictionary/settings initialization can replace the current c3main ExpObject hooks.
- [ ] If viable, replace the generated-code settings patch with owned runtime JS and package/static tests.
- [ ] If not viable, document the timing or Construct-runtime reason and keep patch-c3main.mjs narrowly guarded.

## Related

- `product/plugins/yoshis-fabrication-station/tools/patch-c3main.mjs`
- `product/plugins/yoshis-fabrication-station/scripts/direct-launch-pre.js`
- `product/plugins/yoshis-fabrication-station/package.nix`
- `work/items/active/01KVR33GX90663PBCRJ6AJT17W-yfs-viewport-zoom-runtime-config/plan.md`
