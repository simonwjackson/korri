---
id: task-009
title: Raise sessiond contract test coverage to 100%
status: Blocked
priority: medium
labels:
  - testing
  - sessiond
  - foreground-session
  - quality
created: 2026-05-29
source: user
---

# Raise sessiond contract test coverage to 100%

## Context

`sessiond` is the host-local foreground-session supervisor for Korri device roles. It is no longer just a helper launcher: kiosk and source-machine images route managed launches through it so one daemon owns the host's graphical/session lifecycle.

Current model to preserve while testing:

- **Kiosk role:** `sessiond` owns the Electrobun/Korri home renderer hand-off. It enters `home`, stops the renderer before a foreground launch, restores the renderer afterward, reconciles the home window invariant, and emits `home-ready`.
- **Source-machine role:** `sessiond` owns an idle-blank Sway host with no Korri GUI client. It restores to `idle`, verifies no Gamescope windows/processes remain, observes a cooldown, and emits `idle-ready`.
- **Managed-launch protocol:** clients use `/managed-launch/status`, `/managed-launch`, `/managed-launch/events`, and `/managed-launch/terminate` with `x-korri-sessiond-token`. Readiness is proven by terminal lifecycle events, not inferred from child exit alone.
- **App/server seam:** `app.library.launch` goes through the in-process foreground-session owner, then the live `Launcher`, then `createSessionLauncherFromEnv()` when `KORRI_SESSIOND_URL` is configured. This means both the in-process owner and `sessiond` must remain covered at their public contracts.
- **System seam:** Nix modules/images package and run `korri-sessiond`, generate/share the token file, set PATH/environment for spawned children, and wire server/game-stream clients to the daemon.

Drive unit and integration coverage to 100% on real public contracts, not private implementation shape.

## Why it matters

`sessiond` is the single-supervisor boundary for renderer hand-off, game launch lifecycle, readiness, termination, and recovery; regressions here become black screens, stuck busy gates, broken streaming launches, or unrecoverable device sessions.

## Acceptance Criteria

- [ ] Coverage tooling is wired for the sessiond-relevant test slice with a reported baseline and a repeatable command behind `just` or existing test tooling.
- [ ] Public HTTP contract coverage exists for `/control/start`, `/control/stop`, `/control/reconcile`, `/managed-launch/status`, `/managed-launch`, `/managed-launch/events`, `/managed-launch/terminate`, unauthorized requests, malformed payloads, busy rejection, and legacy `/launch` compatibility.
- [ ] Managed-launch lifecycle coverage includes foreground launches, child spawn failure, child exit failure, restore success, restore failure/recovering, graceful terminate, force terminate, SSE replay, heartbeat/early-close behavior, and bounded reconnect behavior.
- [ ] Session lifecycle coverage includes `lifecycle: "session"`, `launcher-exited`, wait-monitor success/failure, degrade-to-anchor, `session-anchored`, terminate-from-anchor, and final readiness.
- [ ] Kiosk role coverage verifies renderer launch/stop/restore, home invariant reconciliation, duplicate-window cleanup, focus/fullscreen repair, missing-window relaunch, and `home-ready` evidence.
- [ ] Source-machine role coverage verifies idle-blank evaluation, Gamescope window cleanup, lingering process handling, cooldown waiting, timeout failure, surface repair hook success/failure, and `idle-ready` evidence.
- [ ] Client-side sessiond launcher coverage verifies capability negotiation, token/env resolution, status decode failures, start response decode failures, readiness mapping (`home-ready` and `idle-ready`), failure mapping, and termination calls.
- [ ] In-process foreground-session owner coverage remains contract-level: launch acceptance, `session-busy` rejection in every non-idle state, prepare/spawn/foreground failures, exit observation, teardown/readiness gates, abort behavior, and event history limits.
- [ ] Nix/module coverage verifies package availability, unit environment, token generation/share mode, PATH requirements, role inference/assertions, server delegation env, game-stream delegation env, and kiosk/source-machine image wiring.
- [ ] No `Mock*` / `Stub*` / `Fake*` doubles are introduced. Harness doubles are real implementations with configurable `behavior` / `config` arguments and live beside the contracts they implement.
- [ ] Coverage report reaches 100% line and branch coverage for the sessiond public surface; any genuinely untestable process/OS boundary is documented as a narrow exclusion with rationale.
- [ ] `just test-unit`, `just test-nix`, `just lint`, `just typecheck`, and the new coverage command exit green; the coverage gate is enforced in CI for the sessiond-relevant slice.

## Related

- `tools/device/sessiond.ts`
- `tools/device/sessiond-state.ts`
- `tools/device/sessiond-role.ts`
- `tools/device/sessiond-source-machine.ts`
- `tools/device/sessiond-electrobun.ts`
- `tools/device/sessiond-gamescope-reaper.ts`
- `tools/device/sessiond-status-sidecar.ts`
- `tools/device/sessiond-sway.ts`
- `korri/shared/library/session-launcher.ts`
- `korri/shared/library/sessiond-managed-launch-protocol.ts`
- `korri/shared/library/launcher.ts`
- `korri/shared/stream/foreground-session-lifecycle.ts`
- `korri/shared/stream/foreground-session-owner.ts`
- `korri/products/app/api/library/local-foreground-launch-adapter.ts`
- `korri/products/app/api/library/launch.rpc-handler.ts`
- `korri/products/app/api/server/status.rpc-handler.ts`
- `nix/korri-sessiond.nix`
- `nix/modules/korri-sessiond.nix`
- `nix/modules/korri-server.nix`
- `nix/modules/korri-game-stream.nix`
- `nix/images/kiosk.nix`
- `nix/images/source-machine.nix`
- `nix/tests/korri-sessiond-module-check.nix`
- `nix/tests/korri-server-module-check.nix`
- `nix/tests/korri-source-machine-image-check.nix`
- `docs/research/foreground-session-lifecycle/`
- `docs/reviews/current-branch/foreground-session-*`
- `docs/plans/2026-05-27-004-feat-kiosk-renderer-ownership-sessiond-plan.md`
- `docs/solutions/architecture-patterns/kiosk-renderer-ownership-by-sessiond-2026-05-27.md`
- `docs/solutions/runtime-errors/sessiond-sse-stream-killed-by-bun-idle-timeout-2026-05-27.md`

## Notes

Treat “100%” as the operational target for the sessiond slice, but do not chase meaningless coverage by testing private branches directly. The valuable outcome is contract-level confidence across daemon HTTP/SSE behavior, role readiness invariants, launcher-client behavior, foreground-session owner behavior, and Nix wiring.

Promote to `se-plan` before implementation unless the coverage command and target file set are already obvious; this likely needs sequencing across Bun unit tests, Nix eval tests, and CI gating.

2026-05-29: marked **Blocked** during the long-session sweep. AC #1 ("coverage tooling wired with a reported baseline and a repeatable command") cannot proceed until the coverage tool itself works. `bun test --coverage` produces no output under the current `bunfig.toml` preload setup (suspected happy-dom interference); see **task-037** for the focused tooling investigation. Once the tooling lands, this task's remaining ACs (#2-#11) are achievable as a sequence of focused PRs against the listed file set.

Meanwhile, prior sweep PRs added substantial sessiond-surface coverage:
- PR #5 (task-011): sessiond system wiring + module tests.
- PR #6 (task-012): sessiond canonical lifecycle source + app.server.status integration.
- PR #7 (task-034): foreground-session-status layer end-to-end via loopback.
- PR #8 (task-017): foreground-session transition + failure semantics, redaction guards.
- PR #9 (task-013): launch identity correlators + protocol evolution rule.
- PR #10 (task-014): launcher-anchor lifecycle plumbing.
- PR #11 (task-015): kiosk readiness invariants + structured evidence.
- PR #12 (task-016): source-machine idle-ready evidence wire-shape pins.

The surface is meaningfully covered; the gap is the missing baseline that would let us claim “100% on contract.”
