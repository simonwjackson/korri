## Institutional Learnings Search Results

### Search Context
- **Feature/Task**: Plan default-on Gamescope wrapping for all Korri foreground app launches, with minimal wrapping, config-cascade opt-out, and separate mandatory foreground-session ownership.
- **Keywords Used**: gamescope, foreground, kiosk, Sway, sessiond, Moonlight, Sobo, stream runner, launch intent, NixOS, ROCKNIX, config cascade, ProseQL.
- **Files Scanned**: 35 files under `docs/solutions/` via grep pre-filter.
- **Relevant Matches**: 8 candidate files; 7 had actionable planning relevance.

### Critical Patterns
- `docs/solutions/patterns/critical-patterns.md` does not exist in this repo.

### Relevant Learnings

#### 1. Kiosk foreground app policy belongs to the session, not Gamescope
- **File**: `docs/solutions/architecture-patterns/kiosk-foreground-app-policy-over-gamescope-overlay-2026-05-24.md`
- **Module**: Korri kiosk/session foreground policy
- **Problem Type**: `architecture_pattern`
- **Relevance**: This is the closest direct learning for the plan: Sobo tiled Moonlight beside Korri because Sway had no generic foreground-app policy. It explicitly separates the session policy from Gamescope wrapping.
- **Key Insight**: Gamescope may wrap the child app, but the parent kiosk/session owner still must focus/fullscreen/workspace-isolate the resulting surface and restore Korri afterward. Do not use app-id-specific Sway rules as the primary architecture.
- **Severity**: high
- **Planning Constraint**: The new requirement changes the default from “Gamescope optional” to “Gamescope on by default,” but it should not overturn the core boundary: default-on Gamescope is an adapter default, not the foreground/overlay mechanism.

#### 2. Validate the generic game stream runner with a fresh launch intent per session
- **File**: `docs/solutions/workflow-issues/generic-game-stream-runner-validation-contract-2026-05-19.md`
- **Module**: Korri generic game stream runner
- **Problem Type**: `workflow_issue`
- **Relevance**: The stream runner already models the generic foreground command contract: a trusted local actor writes a one-shot launch intent; Sunshine launches one stable app; the runner consumes the intent and runs an arbitrary `LaunchSpec`.
- **Key Insight**: Validation must preserve the trusted one-shot intent workflow. Gamescope policy should ride on the resolved launch intent; do not validate by turning Sunshine into per-game config or by replaying stale intents.
- **Severity**: medium
- **Planning Constraint**: Plan tests should cover both fresh-intent success and no-intent/expired-intent behavior. If default-on Gamescope is applied at the intent/resolution layer, it must not weaken the runner’s trusted-intent and quarantine/requeue behavior.

#### 3. Boot-scoped NixOS control plane with session-scoped runner via shared private runtime dir
- **File**: `docs/solutions/architecture-patterns/boot-scoped-control-plane-with-session-scoped-runner-2026-05-19.md`
- **Module**: `nix/modules/korri-server`
- **Problem Type**: `architecture_pattern`
- **Relevance**: Default Gamescope touches launch intent payloads, runner wrappers, system/user service mode, and NixOS module defaults. This learning captures the lifecycle split and trust contract that must survive those changes.
- **Key Insight**: Derive runtime paths, env, ownership, and assertions from the explicit service mode. The control plane and session-scoped runner must agree on one private runtime directory and non-root UID; fail unsafe path/ownership combinations at Nix evaluation time.
- **Severity**: medium
- **Planning Constraint**: If the plan changes any module-level Gamescope defaults or wrapper env, include Nix module evaluation tests, not only TypeScript unit tests. Keep Sunshine/session-scoped runner assumptions explicit.

#### 4. Supervise Chromium kiosk sessions instead of trusting kiosk flags after game exit
- **File**: `docs/solutions/integration-issues/supervise-chromium-kiosk-session-after-game-exit-2026-05-04.md`
- **Module**: Odin Chromium session supervisor
- **Problem Type**: `integration_issue`
- **Relevance**: This is the earlier sessiond lesson behind the current foreground policy: launch flags cannot guarantee kiosk/session invariants after focus changes, crashes, or app exit.
- **Key Insight**: Treat fullscreen/chromeless/kiosk state as a session invariant. Route launches through the supervisor that owns restoration, suspend home repair while a foreground app is active, relaunch/repair home after exit, and avoid broad `pkill -f` cleanup.
- **Severity**: high
- **Planning Constraint**: Default-on Gamescope should be implemented through the same launch/session lifecycle boundary, not as a direct spawn shortcut. Fail closed when the session owner is configured but unavailable; do not silently fall back to a path that bypasses the kiosk guarantee.

#### 5. One-command Odin Electrobun deploy needs device Nix and session env
- **File**: `docs/solutions/integration-issues/one-command-odin-electrobun-deploy-needs-device-nix-and-session-env-2026-05-06.md`
- **Module**: scripts/odin + tools/odin/sessiond
- **Problem Type**: `integration_issue`
- **Relevance**: Gamescope and Sway foreground repair both depend on a real session environment, especially `XDG_RUNTIME_DIR`, `WAYLAND_DISPLAY`, and `SWAYSOCK`.
- **Key Insight**: Systemd-launched wrappers do not inherit an interactive Sway shell environment. Wrappers that start GUI apps or run `swaymsg` must supply conservative display defaults and validate on a real device.
- **Severity**: medium
- **Planning Constraint**: Default-on Gamescope will make missing Wayland env a more common preflight failure. The plan should explicitly verify wrapper env for both Gamescope startup and Sway repair, especially on Sobo/kiosk services.

### Adjacent Learnings and Constraints

- **Config cascade / ProseQL ownership**: `docs/solutions/best-practices/proseql-canonical-library-with-derived-yaml-ids-2026-05-06.md` is not a Gamescope doc, but it reinforces that Korri-owned ProseQL YAML is the runtime source of truth and external ROCKNIX metadata should stay an importer/snapshot seam. Planning should keep Gamescope defaults in Korri-owned config, not in ROCKNIX gamelist state. The more specific cascade details live in `docs/briefs/2026-05-21-korri-config-cascade-brief.md`, not `docs/solutions/`.
- **Runtime service ownership**: `docs/solutions/integration-issues/runtime-mask-essway-to-stop-emulationstation-relaunching-during-odin-kiosk-sessions-2026-05-03.md` reinforces “find the owning systemd unit before changing process behavior” and “use reversible runtime masks for temporary kiosk experiments.” This is mostly Odin/ROCKNIX-specific, but useful if foreground validation involves live service changes.
- **Sobo runtime topology update**: `docs/solutions/integration-issues/odin-electrobun-webkit-runtime-white-screen-2026-05-04.md` includes a 2026-05-20 Sobo update: Sobo has real `/nix/store`, runs `rocknix-sway-kiosk.service`, and does not use `essway`/`proot`/runtime `LD_LIBRARY_PATH`. Treat older Odin/portable-Nix guidance in that doc as historical for Sobo planning.

### Stale or Conflicting Docs / Evidence

- `docs/solutions/architecture-patterns/kiosk-foreground-app-policy-over-gamescope-overlay-2026-05-24.md` says “Gamescope is an optional app presentation adapter” and warns that Sobo Moonlight `v4l2m2m + SDL/Wayland` should be wrapped only as an experiment. The new requirement deliberately changes the product default to default-on Gamescope, including local Moonlight. This is a real change in policy default, not a contradiction of the architectural boundary. The plan should call out the risk and include a narrow opt-out path for Moonlight/Sobo if validation fails.
- `docs/solutions/integration-issues/supervise-chromium-kiosk-session-after-game-exit-2026-05-04.md` references older `tools/odin/sessiond-*` paths. Current planning should use current repo paths such as `tools/device/sessiond*`; the invariant remains relevant.
- Current code evidence conflicts with the new desired default: `tools/device/game-stream-runner.ts` currently treats missing intent Gamescope policy as `{ enabled: false }`, while `tools/device/game-stream-fullscreen.ts` already composes the desired minimal wrapper as `gamescope -f -b -- <command>`. Planning should include a unit to move the default to the resolved policy/config layer and update tests expecting default-off behavior.
- The existing config cascade already supports Gamescope as an inheritable field across global/user/system/launcher/game/preset/override, and explicit `false` overrides inherited `true` (`korri/shared/library/config/cascade-resolver.ts`, `korri/shared/library/config/cascade-resolver.test.ts`). Planning should prefer changing seeded/default policy over inventing a separate env-var or runner-only default.

### Recommendations for the Plan

- Preserve the two-layer model: **resolved Gamescope policy wraps the app; foreground session ownership promotes/restores the surface**.
- Make the default-on value visible in normal config resolution, ideally as the broadest default layer, so host/system, launcher, game, preset/profile, and launch override can disable it with explicit `false`.
- Keep the default wrapper minimal: the existing `gamescope -f -b --` composition matches the requirement; do not add scaling/filter/resolution args by default.
- Add tests at three levels: cascade resolution for broad default + specific opt-out, runner composition/preflight for enabled/disabled policy, and Nix/module or wrapper tests for Gamescope availability and session env.
- Validate on-device with both a generic Nixpkgs game and local Moonlight/Sobo. Moonlight should be part of acceptance because the requirement explicitly includes it, and prior docs flag it as the risky path.
- Do not reintroduce `KORRI_GAME_STREAM_USE_GAMESCOPE` or another invisible env-only user policy knob; env can carry tool/session paths, not product policy.
