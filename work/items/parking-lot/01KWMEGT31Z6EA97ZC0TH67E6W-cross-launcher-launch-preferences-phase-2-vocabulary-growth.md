---
id: 01KWMEGT31Z6EA97ZC0TH67E6W
slug: cross-launcher-launch-preferences-phase-2-vocabulary-growth
title: Cross-launcher launch preferences — Phase 2+ vocabulary growth
origin: parked
status: To Do
priority: medium
labels:
  - korri
  - launch-config
  - plugins
  - preferences
  - cross-launcher
created: 2026-07-03
source: se-work
context:
  cwd: product/platform/library/config
  branch: trunk
  repo: korri
---

# Cross-launcher launch preferences — Phase 2+ vocabulary growth

## Why it matters

Phase 1 shipped the plumbing plus four portable preferences (video.fullscreen, video.resolution, video.aspect-ratio, audio.volume) at preferences.launch, folded through the cascade and translated by RPCS3 + Ryubing. The remaining next phases are currently only prose in the completed work item's design.md/plan.md, invisible to other sessions. Capturing them keeps the "configure my whole library's common preferences once" north star progressing incrementally instead of stalling, and records the known-hard value-vocabulary problems so they aren't rediscovered.

## Acceptance Criteria

- [ ] Add a verified Ryubing aspect-ratio value map so video.aspect-ratio maps to Ryubing (currently dropped in Phase 1 — no verified native value map existed)
- [ ] Add Phase 2 shared keys with per-launcher value maps: frame-limit, vsync, language
- [ ] Design a neutral quality/scale concept mapping to RPCS3 Resolution Scale AND the Switch's docked/handheld base x resolution-scale (the real Switch equivalent of 'resolution')
- [ ] Decide the fate of non-portable audio.backend / audio.device (no shared value domain today; stay plugin-specific until a neutral domain exists)
- [ ] Extend the vocabulary to a third launcher (RetroArch or Dolphin) to validate generality beyond the two derivation instances
- [ ] Reserve/populate preferences.display for physical monitor / desktop resolution (namespace reserved in Phase 1)

## Related

- `work/items/active/01KWM7Q407Q0QDVZ4SY4BZBKHY-cross-emulator-settings-vocabulary/design.md`
- `work/items/active/01KWM7Q407Q0QDVZ4SY4BZBKHY-cross-emulator-settings-vocabulary/plan.md`
- `product/platform/library/config/inheritable-fields.ts`
- `product/plugins/rpcs3/src/preferences-mapping.ts`
- `product/plugins/ryubing/src/preferences-mapping.ts`

## Notes

Phase 1 landed on trunk (commits b74162a6..45f0fb45). Design + deferral rationale: work/items/active/01KWM7Q407Q0QDVZ4SY4BZBKHY-cross-emulator-settings-vocabulary/design.md. Known-hard item: launcher value vocabularies differ (RPCS3 "16:9" vs Ryubing "Fixed16x9"); never emit unverified emulator strings. Also revisit the documented Phase 1 simplification: shared and plugin trees fold independently then overlay, so a launcher-specific key at any layer beats a shared preference at any layer (no cross-layer specificity between the two trees).
