---
id: task-008
title: Model RetroArch per-button input binds
status: To Do
priority: high
labels:
  - retroarch
  - cascade
  - input
  - bandai
created: 2026-06-10
source: user
---

# Model RetroArch per-button input binds

## Why it matters

Bandai's live YAML needs raw `extraSettings` for `input_player1_*` button, D-pad, and axis binds because the typed RetroArch input schema only covers high-level input and port settings today. Modeling binds directly would keep app-local control defaults readable and avoid raw config-key escape hatches for the OOB controller experience.

## Acceptance Criteria

- [ ] RetroArch input schema supports typed per-port binds for buttons, D-pad hats, analog axes, triggers, and menu-toggle button where needed.
- [ ] `renderRetroArchConfig` emits the corresponding `input_playerN_*` keys from typed bind fields without using `extraSettings`.
- [ ] Cascade tests cover a normalized Xbox-style player-1 config and verify generated config contains A/B/X/Y, D-pad, shoulder, trigger, stick, and menu-toggle binds.
- [ ] Bandai RetroArch app defaults can be expressed without `extraSettings` while preserving working Yoshi controls.

## Related

- `product/platform/library/config/inheritable-fields.ts`
- `product/platform/stream/retroarch-launch-spec.ts`
- `product/platform/stream/retroarch-launch-spec.test.ts`
- `/var/lib/korri/library/library.yaml`

## Notes

Requested after live Bandai workaround used `extraSettings` for `input_player1_b_btn`, `input_player1_up_btn`, axes, etc. User prefers typed app-local RetroArch input config.
