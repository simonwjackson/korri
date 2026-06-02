---
id: task-087
title: Build autonomous live-resolution regression gate
status: To Do
priority: high
labels:
  - streaming
  - testing
  - hardware-validation
  - runtime-resolution
created: 2026-06-02
source: user
---

# Build autonomous live-resolution regression gate

## Why it matters

The feature depends on physical bandai-visible behavior; logs alone previously produced false wins. A repeatable gate is needed to prevent regressions in future patch cleanup and productization.

## Acceptance Criteria

- [ ] A single command starts or attaches to a stream, applies runtime resolution/bitrate changes, captures aka host and bandai DSI-2 frames, and computes RMSE motion gates.
- [ ] Gate fails if bandai is frozen even when host is moving.
- [ ] Gate records Moonlight/Sunshine logs, local-control state snapshots, and applied command results.
- [ ] Gate supports downshift, upshift, and repeated-cycle soak modes.

## Related

- `tools/scripts/live-runtime-resolution-gate.sh`
- `/storage/probe-a-resolution/probe.ts`
- `packages/moonlight-embedded-korri/patches/0007-wire-local-control-runtime-command-events.patch`

## Notes

Physical validation source of truth: explicit grim -o DSI-2 on bandai and grim -o HDMI-A-1 on aka, then compare time-separated frames.
