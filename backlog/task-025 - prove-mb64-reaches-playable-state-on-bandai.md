---
id: task-025
title: Prove MB64 reaches playable state on bandai
status: In Progress
priority: high
labels:
  - mb64
  - bandai
  - prototype
  - emulation
  - follow-up
created: 2026-06-04
source: user
context:
  cwd: .worktrees/feat/mario-builder-64-bandai-prototype
  branch: feat/mario-builder-64-bandai-prototype
  commit: 5ac4bbe
  repo: simonwjackson/korri
  invoked_by: user
---

# Prove MB64 reaches playable state on bandai

## Why it matters

The current Mario Builder 64 prototype only proves SM64 boots and MB64 renders the title/SD-warning screens. Shipping even a ROM-only launcher would risk delivering a non-playable integration unless a real controller/manual pass or working input harness proves MB64 can advance into menu, editor, or gameplay on bandai.

## Acceptance Criteria

- [ ] Relaunch MB64 on bandai using the staged RetroArch + mupen64plus-next runtime or its productized equivalent.
- [ ] Use a real controller/manual device input pass, or a verified input harness, to attempt advancing past the SD-card warning.
- [ ] Capture screenshot/video evidence showing either menu/editor/gameplay reached, or that the warning remains blocking.
- [ ] Update docs/acceptance/mario-builder-64-bandai-prototype-2026-06-04.md with the honest G4/G10 outcome and Phase 2 shipping decision.
- [ ] If editor/gameplay is reached, define whether a ROM-only launcher is viable; if not, pivot to standalone Parallel Launcher / SC64-capable runtime planning.

## Related

- `docs/plans/2026-06-04-003-feat-mario-builder-64-bandai-prototype-plan.md`
- `docs/acceptance/mario-builder-64-bandai-prototype-2026-06-04.md`
- `.worktrees/feat/mario-builder-64-bandai-prototype`
- `commit:5ac4bbe`

## Notes

Temporary handoff captured at /tmp/handoff-vZRz8N.md before conversion. Current bandai staging path: /storage/korri/staging/mb64-prototype/. No probe service should be running. Current truth: G1/G2/G3 pass; G4 partial title/warning only; G5 blocked no SD emulation; G10 blocked no gameplay loaded.
