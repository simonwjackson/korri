---
id: 01KSRGFP08VSZ99ZD7MZC8QBCW
slug: sessiond-100-percent-test-coverage
title: "Raise sessiond contract test coverage to 100%"
origin: parked
legacy: task-009
status: To Do
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
- `../01KSKBP82KPD8XQEF6PJ12C9RN-feat-kiosk-renderer-ownership-sessiond/plan.md`
- `docs/solutions/architecture-patterns/kiosk-renderer-ownership-by-sessiond-2026-05-27.md`
- `docs/solutions/runtime-errors/sessiond-sse-stream-killed-by-bun-idle-timeout-2026-05-27.md`

## Notes

Treat “100%” as the operational target for the sessiond slice, but do not chase meaningless coverage by testing private branches directly. The valuable outcome is contract-level confidence across daemon HTTP/SSE behavior, role readiness invariants, launcher-client behavior, foreground-session owner behavior, and Nix wiring.

Promote to `se-plan` before implementation unless the coverage command and target file set are already obvious; this likely needs sequencing across Bun unit tests, Nix eval tests, and CI gating.

2026-05-29: marked **Blocked** during the long-session sweep. AC #1 ("coverage tooling wired with a reported baseline and a repeatable command") cannot proceed until the coverage tool itself works. `bun test --coverage` produces no output under the current `bunfig.toml` preload setup (suspected happy-dom interference); see **task-037** for the focused tooling investigation. Once the tooling lands, this task's remaining ACs (#2-#11) are achievable as a sequence of focused PRs against the listed file set.

2026-05-29 (later): **task-037 shipped — unblocking.** Root cause was a bun 1.3.3 CLI/config interaction (not happy-dom), fixed by a separate `bunfig.coverage.toml`. `just test-coverage` and `just test-coverage-sessiond` recipes now exist; baseline is captured in `docs/solutions/tooling-decisions/bun-coverage-via-separate-config-2026-05-29.md`. AC #1 satisfied; remaining ACs are gap-closing PRs against the documented baseline. Highest-value gaps in order: `tools/device/sessiond.ts` (71.97% lines, 300+ uncovered), `sessiond-gamescope-reaper.ts`, `sessiond-electrobun.ts`, `sessiond.ts` HTTP/SSE endpoint surfaces, then the lower-traffic files.

2026-05-29 (pass 1): **first gap-closing batch landed.** Three files reached 100% (or effective 100%) via focused test additions:

- `tools/device/sessiond-state.ts` — 94.74% → **100%** (added `beginKorriLaunch` non-home rejection tests).
- `tools/device/sessiond-source-machine.ts` — 94.44% → **99.08%** (added windows-lingered timeout test + real-setTimeout delay smoke test).
- `korri/shared/library/sessiond-managed-launch-protocol.ts` — 96.49% → **99.42%** (added `decodeSessiondManagedLaunchTerminateResponse` strict-decode tests + ISO-timestamp filter reject test).

Next-step children filed:
- **task-039** — cover `tools/device/sessiond.ts` managed-launch HTTP/SSE surface (the daemon dispatcher; biggest remaining gap).
- **task-040** — cover `sessiond-gamescope-reaper.ts` and `sessiond-electrobun.ts` restore paths (operator-visible kiosk symptoms).

2026-05-30 (task-039 pass 1): `tools/device/sessiond.ts` moved **77.36/71.97 → 84.48/84.44** via 16 public HTTP/SSE/daemon-handle tests. Remaining uncovered lines are mostly real host-boundary wiring inside the same file (`swaymsg`, `systemctl`, source-machine real sway controller, `main()` process/env/signal wiring) plus one defensive impossible branch. Filed **task-041** to decide whether to extract those host-boundary helpers, coverage-ignore them, or cover them with a host-capable integration smoke before chasing the original ≥95% file-level target.

2026-05-30 (task-040 pass 1): restore helpers materially covered. `sessiond-electrobun.ts` reached **100/100**. `sessiond-gamescope-reaper.ts` reached **82.61/100**; line coverage is complete, but Bun's function metric remains below the original 85% target despite no uncovered source lines in the text report. Treat as acceptable behavior coverage for now; revisit only if coverage tooling exposes named missed functions or if CI requires the function threshold.

Remaining gaps after pass 1:
- `sessiond.ts` 77.36/71.97 (→ task-039)
- `sessiond-gamescope-reaper.ts` 50.00/55.92 (→ task-040)
- `sessiond-electrobun.ts` 78.95/69.47 (→ task-040)
- `sessiond-smoke.ts` 50.00/46.77 (operator smoke harness; may be acceptable as low-coverage — confirm during task-039)
- `session-launcher.ts` 90.38/91.33 (close after task-039 to stay aligned with the daemon contract)
- `foreground-session-owner.ts` 96.55/95.61 (small remaining gap; ride along with any future foreground-session work)
- `launch.rpc-handler.ts` 79.17/86.32 (close with task-039 since branches are sessiond-managed paths)

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
