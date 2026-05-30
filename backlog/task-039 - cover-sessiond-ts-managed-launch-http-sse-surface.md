---
id: task-039
title: Cover tools/device/sessiond.ts managed-launch HTTP/SSE surface
status: To Do
priority: medium
labels:
  - testing
  - sessiond
  - coverage
  - task-009
created: 2026-05-29
source: se-work
context:
  cwd: .
  branch: test/sessiond-coverage-pass-1
  repo: simonwjackson/korri
  invoked_by: se-work
---

# Cover `tools/device/sessiond.ts` managed-launch HTTP/SSE surface

## Context

`tools/device/sessiond.ts` is the daemon dispatcher and the largest production file in the sessiond slice. Per `task-037`'s baseline (captured in `docs/solutions/tooling-decisions/bun-coverage-via-separate-config-2026-05-29.md`), current coverage is **77.36% funcs / 71.97% lines** with ~300 uncovered lines clustered in:

- Lines 410-431: managed-launch HTTP endpoint branches (`/managed-launch`, `/managed-launch/terminate`).
- Lines 480-544: SSE stream (`/managed-launch/events`) — replay, heartbeat, bounded reconnect, early-close.
- Lines 557-576: session-lifecycle branches (`launcher-exited`, wait-monitor outcomes, `session-anchored`).
- Lines 623-628, 708-711, 731, 750-752: per-launch termination paths (graceful, force, after-anchor).
- Lines 805-853, 954-1100: recovery / restore-failure / unrecoverable-state branches.

This is task-009's heaviest remaining lift. Splitting it from the cheap-gap closure (test/sessiond-coverage-pass-1) keeps PR review tractable.

## Why it matters

`sessiond.ts`'s HTTP/SSE surface is the contract every sessiond client (renderer, source-machine, kiosk roles, CLI tools, smoke harness) depends on. Coverage gaps here are silent regression vectors: a refactor that breaks the replay sequence or the bounded-reconnect budget will not be caught by any existing test because the affected lines aren't exercised.

## Acceptance Criteria

- [ ] Add public-contract tests through the daemon's HTTP surface (not internal helpers) for:
  - `/managed-launch` malformed payloads, duplicate launchIds, busy rejection.
  - `/managed-launch/events` SSE replay, heartbeat cadence, early-close cleanup, reconnect via `Last-Event-ID`.
  - `/managed-launch/terminate` graceful vs force, terminate-while-anchored, terminate-after-already-terminal.
  - Session-lifecycle (`lifecycle: "session"`) branches: launcher-exited normal, launcher-exited with non-zero exit, wait-monitor success/failure, session-anchored transition, terminate-from-anchor.
  - Recovery: 1st/2nd/3rd restore failure progression, transition to `recovering`, `shouldStopAfterRestoreFailure` boundary.
- [ ] Coverage reaches ≥ 95% lines / ≥ 90% funcs on `tools/device/sessiond.ts` after the PR.
- [ ] No `Mock*` / `Stub*` / `Fake*` doubles; harness doubles carry configurable `behavior` / `config` arguments and live beside `sessiond.ts`.
- [ ] The remaining uncovered lines are either documented as defensive exhaustive-default branches OR have a follow-up rationale.

## Related

- `tools/device/sessiond.ts`
- `tools/device/sessiond.test.ts`
- `korri/shared/library/sessiond-managed-launch-protocol.ts` (the wire contract)
- `docs/solutions/tooling-decisions/bun-coverage-via-separate-config-2026-05-29.md` (baseline)
- backlog/task-009 - sessiond-100-percent-test-coverage.md (parent)

## Notes

Surfaced during task-009 pass 1 (`test/sessiond-coverage-pass-1`). The cheap gaps on `sessiond-state.ts`, `sessiond-source-machine.ts`, and `sessiond-managed-launch-protocol.ts` closed in that PR; this is the next-largest gap. Tackle next in the sessiond-coverage sequence.

2026-05-30 pass 1 (`test/sessiond-daemon-http-sse-coverage`): added 16 public-contract tests and moved `tools/device/sessiond.ts` from **77.36% funcs / 71.97% lines** to **84.48% funcs / 84.44% lines**. Covered:

- unauthenticated `GET /status`
- `/control/reconcile`
- authenticated 404
- public-command 500 handler
- duplicate `launchId` / busy rejection while active
- `launcher.spawn` returning `status: "failed"`
- no-spawn `afterChildRunning` failure → host-unavailable
- `beforeChildLaunch` failure → host-unavailable
- reaper residual warning and reaper exception handling
- SSE subscriber cancellation cleanup
- session+wait fallback via `launcher.run` when no spawn capability exists
- wait-monitor spawn returning failed → anchor degradation
- queued graceful/force terminate applied when wait monitor registers
- `startKorriSessiond` handle creation/stop path
- default kiosk production wiring construction without invoking OS commands

Remaining uncovered lines are mostly real host-boundary wiring, not HTTP/SSE behavior: `discoverSwaySocketEnv`, real `swaymsg` runner, source-machine real sway controller, real `systemctl` service manager, `main()` process/env/signal wiring, plus a defensive impossible branch in `launchUnderSession`. Filed **task-041** to decide the durable coverage treatment before forcing private-helper exports or OS-spawning tests. This task remains open until the ≥95% target is either met or explicitly reframed into "daemon HTTP/SSE covered; real host boundary handled separately."
