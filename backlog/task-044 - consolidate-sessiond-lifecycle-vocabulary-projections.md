---
id: task-044
title: Consolidate sessiond lifecycle vocabulary projections
status: Done
priority: medium
labels:
  - architecture
  - refactor
  - sessiond
  - lifecycle
created: 2026-05-30
source: se-architecture-improvement
context:
  cwd: .
  branch: trunk
  commit: bb37a5b
  repo: simonwjackson/korri
  invoked_by: se-architecture-improvement
---

# Consolidate sessiond lifecycle vocabulary projections

## Why it matters

Sessiond lifecycle state is projected through internal modes, managed-launch wire modes/phases, app.server.status summaries, renderer snapshots, and foreground gate states. The mappings are correct today but distributed, so adding a mode or phase risks drift between daemon, RPC, and UI behavior.

## Acceptance Criteria

- [ ] A pure projection layer centralizes mappings from sessiond internal lifecycle state to managed-launch status, app server sessiond summary, and renderer foreground-session status snapshot vocabulary.
- [ ] Existing public wire shapes remain compatible; generated/read-only files are not hand-edited.
- [ ] Tests cover every sessiond mode and phase projection, including role idle aliases (`home` and `idle`), active launch identity, recovery/failure reason handling, and renderer gate-state outcomes.
- [ ] `foreground-session-status-layer-live.ts` and `status.rpc-handler.ts` delegate mapping logic instead of duplicating switch/copy code.
- [ ] The operator model or adjacent architecture note points maintainers to the projection seam if it becomes the canonical place for lifecycle vocabulary mapping.

## Related

- `tools/device/sessiond-state.ts`
- `tools/device/sessiond.ts`
- `korri/shared/library/sessiond-managed-launch-protocol.ts`
- `korri/products/app/api/server/status.rpc.ts`
- `korri/products/app/api/server/status.rpc-handler.ts`
- `korri/products/app/features/home/foreground-session-status-layer-live.ts`
- `korri/shared/stream/foreground-session-gate-state.ts`
- `korri/shared/stream/foreground-session-lifecycle.ts`
- `docs/solutions/architecture-patterns/sessiond-operator-model-2026-05-29.md`

## Notes

Captured from the sessiond architecture-improvement scan. This is about mapping locality, not changing lifecycle semantics.

## Completion Notes

2026-05-30: Added `korri/shared/library/sessiond-lifecycle-projections.ts` and routed daemon managed status, app-server sessiond summary, and renderer foreground-session snapshot mapping through it. Operator model now points maintainers to the projection seam.
