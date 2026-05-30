---
id: task-014
title: Route launcher-anchor apps through session lifecycle
status: Done
priority: medium
labels:
  - sessiond
  - launcher
  - steam
  - foreground-session
created: 2026-05-29
source: user
---

# Route launcher-anchor apps through session lifecycle

## Context

`LaunchExtras` and sessiond already support `lifecycle: "session"` with an optional `wait` spec, but inspected app launch paths call `launcher.spawn(spec)` without extras. This leaves Steam/browser/launcher-anchor flows modeled like simple foreground child processes even when the launcher exits while the real session continues.

## Why it matters

Without session lifecycle adoption, launcher-style apps can restore the host too early, lose the true terminal signal, or require bespoke one-off supervision. The protocol has the right shape; product launch paths need to use it intentionally.

## Acceptance Criteria

- [ ] Identify launchers/apps that require `lifecycle: "session"` rather than simple foreground child semantics.
- [ ] Extend launch resolution or launch policy so app paths can pass `LaunchExtras` (`lifecycle`, optional `wait`) to `Launcher.spawn`.
- [ ] Sessiond client behavior degrades predictably when `sessionLifecycle` capability is absent.
- [ ] Covered event paths include `launcher-exited`, `wait-monitor-running`, `wait-monitor-exited`, `session-anchored`, terminate-from-anchor, and terminal readiness.
- [ ] At least one representative launcher-anchor flow is exercised end-to-end through sessiond.
- [ ] Documentation or code comments explain when to use foreground vs session lifecycle.

## Related

- `korri/shared/library/launcher.ts`
- `korri/shared/library/session-launcher.ts`
- `korri/shared/library/sessiond-managed-launch-protocol.ts`
- `korri/products/app/api/library/launch.rpc-handler.ts`
- `tools/device/sessiond.ts`
- backlog/task-010 - steam-like-savestate-sync.md

## Notes

This is likely a feature plan, not a quick patch. Keep save-state sync out of scope except for preserving the necessary session lifecycle hooks.
