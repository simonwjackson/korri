---
id: task-018
title: Document the sessiond operator model
status: To Do
priority: low
labels:
  - sessiond
  - docs
  - operations
created: 2026-05-29
source: user
---

# Document the sessiond operator model

## Context

The sessiond model spans daemon HTTP/SSE contracts, role-specific readiness (`home` vs `idle`), Nix token wiring, launch lifecycle events, and recovery diagnostics. The knowledge currently exists across code comments, plans, reviews, and solutions docs.

## Why it matters

Operators and agents need a concise map for diagnosing busy hosts, black screens, unreadable tokens, SSE disconnects, Gamescope residue, and restore failures. Without a canonical operator model, future work will rediscover the same seams.

## Acceptance Criteria

- [ ] Document “one sessiond per foreground-capable host” and what lifecycle truth it owns.
- [ ] Document role-specific idle meanings: kiosk `home`, source-machine `idle`.
- [ ] Document expected managed-launch event sequences for foreground and session lifecycle.
- [ ] Document auth/token expectations and common unreadable-token failure modes.
- [ ] Document operator diagnostics for session busy, restore failure, SSE reconnects, and Gamescope residue.
- [ ] Cross-link relevant backlog items for non-root, multi-user, session lifecycle, and coverage work.
- [ ] Put durable knowledge under the project’s accepted docs shape, not in backlog notes.

## Related

- `tools/device/sessiond.ts`
- `korri/shared/library/sessiond-managed-launch-protocol.ts`
- `nix/modules/korri-sessiond.nix`
- `nix/images/kiosk.nix`
- `nix/images/source-machine.nix`
- `docs/solutions/architecture-patterns/kiosk-renderer-ownership-by-sessiond-2026-05-27.md`
- `docs/solutions/runtime-errors/sessiond-sse-stream-killed-by-bun-idle-timeout-2026-05-27.md`
- backlog/task-004 - stop-running-as-root.md
- backlog/task-008 - multi-user-support.md
- backlog/task-009 - sessiond-100-percent-test-coverage.md
- backlog/task-014 - route-launcher-anchor-apps-through-session-lifecycle.md

## Notes

Do this after the high-priority behavior/wiring items settle, unless an operator-facing debug session needs the doc sooner.
