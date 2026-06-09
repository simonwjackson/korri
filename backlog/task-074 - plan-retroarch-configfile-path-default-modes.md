---
id: task-074
title: Plan RetroArch configFile path/default modes
status: To Do
priority: low
labels:
  - retroarch
  - config
  - precedence
created: 2026-06-08
source: se-challenge-plan
---

# Plan RetroArch configFile path/default modes

## Why it matters

The active RetroArch policy keeps generated mode as the only configFile mode so Korri owns precedence and materialization. Supporting author-authored config paths or default RetroArch config loading needs a separate precedence contract.

## Acceptance Criteria

- [ ] Define precedence for configFile.mode path and default relative to generated cfg, appendconfig, and extraSettings.
- [ ] Define materialization and validation rules for author-authored config paths.
- [ ] Add schema and renderer tests, or document why generated-only remains the product contract.

## Related

- `docs/plans/2026-06-08-004-feat-full-retroarch-config-plan.md`
- `product/platform/library/config/inheritable-fields.ts`
- `product/platform/stream/retroarch-launch-spec.ts`
