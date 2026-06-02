---
id: task-111
title: Fix Bandai Gamescope acceptance harness command ordering and settle
status: To Do
priority: medium
labels:
  - gamescope
  - bandai
  - acceptance
created: 2026-06-02
source: user
---

# Fix Bandai Gamescope acceptance harness command ordering and settle

## Why it matters

The real Bandai run only passed after manually reordering CLI arguments (`filter fsr --socket ...`, `mode 960x540 --socket ...`) and adding a 1s post-mode settle before DSI-2 captures; the checked-in harness still emits the old `--socket`-first form and can capture transient black frames immediately after mode switches.

## Acceptance Criteria

- [ ] `bun tools/scripts/gamescope-control-bandai-acceptance.ts --dry-run` emits commands compatible with the current `gamescope-control` CLI.
- [ ] Real Bandai mode-switch captures wait for compositor/app settle before each screenshot.
- [ ] Harness test covers command ordering and settle behavior.

## Related

- `tools/scripts/gamescope-control-bandai-acceptance.ts`
- `tools/scripts/gamescope-control-bandai-acceptance.test.ts`

## Notes

Observed during full Bandai run on 2026-06-02. Successful settled artifacts: /tmp/gamescope-control-bandai-settled-20260602-135432 on Bandai and local /tmp/gamescope-control-bandai-settled-20260602-135432.
