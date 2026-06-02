---
id: task-098
title: Implement atomic runtime quality-profile command
status: To Do
priority: high
labels:
  - live-resolution
  - live-bitrate
  - quality-ladder
  - product
created: 2026-06-02
source: user
---

# Implement atomic runtime quality-profile command

## Why it matters

Bandwidth savings require coordinated resolution plus bitrate, and sometimes FPS. If the product sends separate commands, transient mismatches can cause poor quality, failed validation, or user-visible instability. A single quality-profile operation would make adaptive switching safer and simpler.

## Acceptance Criteria

- [ ] A quality-profile command can atomically request resolution, bitrate, and FPS
- [ ] Host applies all supported fields consistently or returns a structured partial/failed result
- [ ] Product quality ladder uses the atomic command instead of multiple independent commands
- [ ] Physical regression gate covers at least one profile downshift and upshift

## Related

- `task-058`
- `task-067`
- `task-086`
- `task-091`
- `tools/cli/moonlight-control.ts`
- `korri/shared/stream/moonlight-control-protocol.ts`
