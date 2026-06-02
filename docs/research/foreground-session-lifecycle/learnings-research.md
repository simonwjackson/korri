## Institutional Learnings Search Results

### Search Context
- **Feature/Task**: Phase 1 plan for a generic foreground/session lifecycle contract plus Moonlight/Gamescope re-entry rejection; Phase 2 conservative readiness deferred.
- **Keywords Used**: foreground/session lifecycle, Gamescope, Moonlight, Sway, sessiond, stream runner, launch intent, boot/session boundary, status/observability, real-implementation testing.
- **Files Scanned**: 37 `docs/solutions/` files, plus 2 related `docs/research`/`docs/reviews` files already focused on default Gamescope foreground launch.
- **Relevant Matches**: 7 solution files; 5 distilled below.

### Relevant Learnings

#### 1. Kiosk foreground app policy belongs to the session, not Gamescope
- **File**: `docs/solutions/architecture-patterns/kiosk-foreground-app-policy-over-gamescope-overlay-2026-05-24.md`
- **Module**: Korri kiosk/session foreground policy
- **Problem Type**: architecture_pattern
- **Relevance**: Directly matches this plan's core boundary.
- **Key Insight**: Gamescope is an app presentation adapter, not the owner of focus/fullscreen/workspace/restore. The Phase 1 contract should own `IdleReady -> Preparing/Spawning/Running/...` and reject re-entry generically; Moonlight/Gamescope should be only the first adapter behind that contract.
- **Severity**: high

#### 2. Supervise Chromium kiosk sessions instead of trusting kiosk flags after game exit
- **File**: `docs/solutions/integration-issues/supervise-chromium-kiosk-session-after-game-exit-2026-05-04.md`
- **Module**: Odin Chromium session supervisor
- **Problem Type**: integration_issue
- **Relevance**: Prior working shape for a session owner that coordinates renderer, Sway, game handoff, restore, and failure.
- **Key Insight**: Route launches through a long-lived supervisor, fail closed when the supervisor is configured but unavailable, protect local command-launch control with a token/capability, and use PID/window-aware control instead of broad `pkill`. Phase 1 re-entry rejection can mirror the existing invariant: launch only from the ready/home state; otherwise return a structured failure without spawning.
- **Severity**: high

#### 3. Validate the generic game stream runner with a fresh launch intent per session
- **File**: `docs/solutions/workflow-issues/generic-game-stream-runner-validation-contract-2026-05-19.md`
- **Module**: Korri generic game stream runner
- **Problem Type**: workflow_issue
- **Relevance**: Covers the Moonlight/Sunshine runner contract and observability expectations.
- **Key Insight**: Preserve the trusted one-shot intent model: enqueue/prepare once, launch the stable `Korri Stream` app, consume the intent, and do not replay stale intents. For Phase 1, a busy/re-entry rejection should happen before preparing another host stream or spawning another local child, and should emit/return status evidence rather than mutating prior successful status misleadingly.
- **Severity**: medium

#### 4. Boot-scoped NixOS control plane with session-scoped runner via shared private runtime dir
- **File**: `docs/solutions/architecture-patterns/boot-scoped-control-plane-with-session-scoped-runner-2026-05-19.md`
- **Module**: `nix/modules/korri-server`
- **Problem Type**: architecture_pattern
- **Relevance**: Informs where the foreground/session owner belongs relative to server/control-plane and graphical/session processes.
- **Key Insight**: Do not collapse boot-scoped control and session-scoped graphical execution into one blurry unit. Make lifecycle scope explicit, derive runtime paths/env from that scope, fail closed when ownership/path contracts are unsafe, and push chosen runtime/status paths into the session runner. This matters if the new contract is exposed through server RPC but enforced by a session-local owner.
- **Severity**: medium

#### 5. Prefer real implementations over mocks in unit, integration, and BDD tests
- **File**: `docs/solutions/best-practices/prefer-real-implementations-over-mocks-2026-05-02.md`
- **Module**: testing
- **Problem Type**: best_practice
- **Relevance**: Applies to the Phase 1 testing plan for re-entry, child lifecycle, RPC, and process boundaries.
- **Key Insight**: Test the real foreground owner/launcher path with deterministic configuration: real process spawning against `/bin/true`, `/bin/false`, or an in-repo controllable script; real in-process HTTP/RPC where applicable; real temp runtime/status files. Avoid `Mock*`/`Stub*` seams. A re-entry test should hold one configured-real launch open, issue a second launch, assert typed busy/not-ready, and assert no second prepare/spawn occurred.
- **Severity**: medium

### Additional High-Signal Caveats
- `docs/research/default-gamescope-foreground-launch/repo-research-default-gamescope-plan.md` found that local Moonlight currently bypasses session ownership and fire-and-forgets from the desktop bridge, while `sessiond` already has home/launch/game/restore patterns and tests. Use that as plan input, but verify against the current working tree because `launch-bridge.ts` and new local stream files are modified.
- `docs/reviews/default-gamescope-foreground-launch/deepen-default-gamescope-feasibility.md` flags that the old Moonlight launcher contract lacked a child handle/exit promise and that existing sessiond payloads did not carry Gamescope policy. For this focused Phase 1, explicitly define the managed-session handle and busy result shape rather than leaving it to implementation.
- `docs/solutions/integration-issues/one-command-odin-electrobun-deploy-needs-device-nix-and-session-env-2026-05-06.md` reinforces that systemd-launched session code must export conservative `DISPLAY`, `XDG_RUNTIME_DIR`, `WAYLAND_DISPLAY`, and `SWAYSOCK` defaults; missing Sway env should fail clearly before spawn.

### Recommendations
- Plan a generic `ForegroundSessionOwner` contract first: lifecycle state, active request/session handle, typed `Busy/NotReady` rejection, and structured events/status.
- Route Moonlight/Gamescope through that owner without making Moonlight the abstraction; keep Gamescope wrapping separate from foreground/session ownership.
- Put re-entry rejection before remote prepare and before local spawn, then test that rejected launches create no host prepare call and no child process.
- Defer conservative readiness checks, but leave explicit Phase 1 states/events for `Exiting`, `TearingDown`, and `VerifyingReady` so Phase 2 is additive.
- Use configured-real tests and status/event assertions; avoid mock-only tests that cannot prove the actual spawn/RPC/session wiring.
