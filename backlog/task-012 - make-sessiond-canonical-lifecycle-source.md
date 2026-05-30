---
id: task-012
title: Make sessiond the canonical host lifecycle source
status: To Do
priority: high
labels:
  - sessiond
  - foreground-session
  - architecture
created: 2026-05-29
source: user
---

# Make sessiond the canonical host lifecycle source

## Context

Korri currently has layered lifecycle truth: the in-process `ForegroundSessionOwner` guards `app.library.launch`, while external `sessiond` owns host-local graphical/session state and can also reject launches as busy. This transitional layering creates split status and split diagnostics. The intended model is one `sessiond` per foreground-capable host as the physical host's lifecycle authority.

## Why it matters

Operators, UI, agents, and launch callers need one answer to “is this host ready?” Split truth can make the app think a host is idle while sessiond is busy, or report a local busy rejection without the daemon evidence that explains why.

## Acceptance Criteria

- [ ] Durable design note or inline architecture comment states that physical host foreground lifecycle truth lives in `sessiond`.
- [ ] Renderer/app-facing status reads sessiond-backed lifecycle state instead of the legacy static `IdleReady` endpoint where applicable.
- [ ] `app.server.status` remains the canonical server-side status proxy for sessiond mode/active/phase/failure.
- [ ] Out-of-band `/managed-launch` callers cannot leave app/server status misleadingly idle; status surfaces show sessiond busy state.
- [ ] The role of the in-process `ForegroundSessionOwner` is clarified as either a local preflight/client guard or reduced to a thin sessiond adapter.
- [ ] Busy/readiness diagnostics clearly distinguish local preflight rejection from daemon rejection.
- [ ] Tests prove active sessiond launches are visible through the chosen status surface.

## Related

- `korri/shared/stream/foreground-session-owner.ts`
- `korri/shared/stream/foreground-session-lifecycle.ts`
- `korri/shared/stream/foreground-session-status.ts`
- `korri/products/app/stream/foreground-session-status-client.ts`
- `korri/products/app/api/server/status.rpc.ts`
- `korri/products/app/api/server/status.rpc-handler.ts`
- `korri/deploy/desktop/main.ts`
- `tools/device/sessiond.ts`

## Notes

Promote to `se-plan` before implementation; this is an architectural seam, not just a code cleanup.
