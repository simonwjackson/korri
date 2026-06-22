---
id: 01KVNHQ1JM28EPNY2VZRQDCRTJ
slug: replace-yfs-dom-loader-with-direct-construct-gameplay-jump
title: Replace YFS DOM loader with direct Construct gameplay jump
origin: parked
status: To Do
priority: medium
labels:
  - yfs
  - launcher
  - polish
  - tech-debt
created: 2026-06-21
source: user
---

# Replace YFS DOM loader with direct Construct gameplay jump

## Why it matters

The proven launcher path still automates the Load Level UI by injecting text and clicking through the existing page. It works, but is fragile and slower than using YFS's internal validation and layout transition seam directly. This is polish work after the launcher and acquisition model are stable.

## Acceptance Criteria

- [ ] Identify the stable YFS functions/globals behind `checkLevelCode`, `validateLevelCode`, `LevelCodeJSON`, play globals, and the Level layout transition
- [ ] Implement a direct-launch shim that consumes raw level JSON and enters gameplay without using visible Load Level UI controls
- [ ] Remove or drastically simplify boot-frame/paste-UI overlay behavior
- [ ] Preserve fallback diagnostics if the direct seam is unavailable in a future YFS version
- [ ] Validate on Sobo with at least one Level Share Square YFS level and compare launch time against DOM automation

## Related

- `product/plugins/yoshis-fabrication-station/scripts/direct-launch.js`
- `docs/research/yoshis-fabrication-station-browser-runtime-capture.md`

## Notes

Consolidates the existing direct-Construct-jump backlog item with acceptance from the research notes.
