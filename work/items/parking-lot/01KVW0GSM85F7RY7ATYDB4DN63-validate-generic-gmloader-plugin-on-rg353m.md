---
id: 01KVW0GSM85F7RY7ATYDB4DN63
slug: validate-generic-gmloader-plugin-on-rg353m
title: Validate generic GMLoader plugin on RG353M
origin: parked
status: To Do
priority: high
labels:
  - gmloader
  - rg353m
  - validation
created: 2026-06-24
source: se-work
context:
  cwd: .
  branch: trunk
  commit: bd98b25a
  repo: simonwjackson/korri
  invoked_by: se-work
---

# Validate generic GMLoader plugin on RG353M

## Why it matters

Automated tests cover payload inspection, install layout, library exposure, and launch-spec generation, but the new source-agnostic path still needs hardware proof with real GameMaker payloads, Remap/display/audio environment, and screenshots/logs.

## Acceptance Criteria

- [ ] At least five known-compatible GameMaker payloads install through @korri:gmloader from arbitrary local paths on RG353M
- [ ] Launches reach visible title/menu/gameplay through the normal Korri session path
- [ ] One 32-bit-only payload and one asset-manager failure are classified before or during launch with documented diagnostics
- [ ] docs/research/gmloader-apk-compatibility-matrix.md is updated with generic-plugin results

## Related

- `docs/research/gmloader-apk-compatibility-matrix.md`
- `product/plugins/gmloader/src/plugin.ts`
- `product/plugins/gmloader/src/envelope.ts`
