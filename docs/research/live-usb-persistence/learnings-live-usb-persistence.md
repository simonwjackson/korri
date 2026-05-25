## Institutional Learnings Search Results

### Search Context
- **Feature/Task**: Plan implementation for Korri live USB persistence modes: strict product allowlist, explicit developer/debug broad persistence via boot menu/kernel arg, same-stick USB-only persistence, and locked system image.
- **Keywords Used**: live USB, persistence, persist, NixOS, kiosk, Moonlight, filesystem, runtime state, session, Sway, Gamescope, boot, kernel arg, allowlist, USB, locked image.
- **Files Scanned**: 35 solution markdown files via grep prefilter; 11 candidate frontmatters reviewed; 7 full documents read.
- **Relevant Matches**: 5 primary files, plus adjacent session/runtime-state matches noted in recommendations.

### Critical Patterns
No `docs/solutions/patterns/critical-patterns.md` file exists in this repo.

### Relevant Learnings

#### 1. Boot-scoped NixOS control plane with session-scoped runner via shared private runtime dir
- **File**: `docs/solutions/architecture-patterns/boot-scoped-control-plane-with-session-scoped-runner-2026-05-19.md`
- **Module**: `nix/modules/korri-server`
- **Problem Type**: `architecture_pattern`
- **Relevance**: Directly shapes the live USB split between boot-time system decisions and session-time kiosk/user processes. It also covers safe filesystem contracts for runtime state.
- **Key Insight**: Derive paths, ownership, env, and assertions from one explicit mode option; fail closed at Nix evaluation for unsafe user/path combinations. Keep runtime state in private `/run`/`%t` locations with known ownership, and do not let system/user service scope silently change persistence paths.
- **Severity**: medium

#### 2. ProseQL library YAML should use canonical storage with key-derived IDs
- **File**: `docs/solutions/best-practices/proseql-canonical-library-with-derived-yaml-ids-2026-05-06.md`
- **Module**: `korri/shared/library/proseql + tools/importers/rocknix`
- **Problem Type**: `best_practice`
- **Relevance**: Product-mode persistence needs a narrow allowlist of Korri-owned state, not accidental coupling to external or host-managed files.
- **Key Insight**: Korri-owned persistent data should live in a canonical Korri store; external sources like ROCKNIX/host metadata should be imported or adapted, not treated as the product database. This supports a same-stick allowlist such as Korri library/settings while keeping the runtime API stable.
- **Severity**: medium

#### 3. Runtime-mask essway to stop EmulationStation relaunching during Odin kiosk sessions
- **File**: `docs/solutions/integration-issues/runtime-mask-essway-to-stop-emulationstation-relaunching-during-odin-kiosk-sessions-2026-05-03.md`
- **Module**: `ROCKNIX Odin kiosk loop`
- **Problem Type**: `integration_issue`
- **Relevance**: The live USB plan explicitly wants a locked system image and controlled drift. This prior fix shows how to alter session behavior without mutating the underlying system image.
- **Key Insight**: Prefer reversible runtime changes for session/debug behavior, and identify the real systemd owner via cgroups before killing children or writing persistent overrides. Runtime masks live under `/run` and clear on reboot, matching the locked-image posture.
- **Severity**: medium

#### 4. Supervise Chromium kiosk sessions instead of trusting kiosk flags after game exit
- **File**: `docs/solutions/integration-issues/supervise-chromium-kiosk-session-after-game-exit-2026-05-04.md`
- **Module**: `Odin Chromium session supervisor`
- **Problem Type**: `integration_issue`
- **Relevance**: Persistence mode is a boot/session invariant, not a loose collection of launch flags. The plan should make product/debug mode visible to the session supervisor and avoid silent fallback when invariants fail.
- **Key Insight**: A long-lived session owner should enforce home/game/restoring/recovering state, fail closed when the configured supervisor path is unavailable, and protect local command-launching daemons with a token/capability file. Do not rely on browser/kiosk flags or broad `pkill` cleanup to preserve appliance behavior.
- **Severity**: high

#### 5. Kiosk foreground app policy belongs to the session, not Gamescope
- **File**: `docs/solutions/architecture-patterns/kiosk-foreground-app-policy-over-gamescope-overlay-2026-05-24.md`
- **Module**: `Korri kiosk/session foreground policy`
- **Problem Type**: `architecture_pattern`
- **Relevance**: The brainstorm names Moonlight state and kiosk behavior as persistence requirements. This learning keeps Moonlight/Gamescope-specific state separate from the session policy that should consume persisted configuration.
- **Key Insight**: The session layer owns product semantics such as home, foreground app, restore, focus/fullscreen, and recovery; Gamescope/Moonlight are app presentation adapters. Product/debug persistence should feed session policy, not encode app-specific compositor exceptions into the system image.
- **Severity**: high

### Recommendations
- Treat the persistence mode as an explicit boot-derived configuration value, then derive mounts/bind paths, visible labels, session env, and assertions from that one value.
- Keep product-mode persistence as Korri-owned allowlisted directories/files on the approved same-stick persistence area; avoid persisting broad `$HOME` or host-managed metadata by default.
- Separate persistent state from runtime state: one-shot launch intents, status files, PID/window repair state, and temporary masks belong under `/run` or another ephemeral runtime directory unless explicitly allowed.
- Use NixOS/module assertions for unsafe cases: missing approved USB persistence area, internal-disk fallback, root-owned writable state, relative paths, or mode/path combinations that escape the same-stick contract.
- Make developer/debug mode boot-only, visibly labeled, and reversible. Prefer runtime overlays/masks and broad persisted debug directories on the USB persistence area, not permanent changes to the locked system image.
- Adjacent files worth consulting during detailed planning: `temporary-rocknix-sidecar-media-instead-of-es-gamelist-edits-2026-05-03.md` for Korri-owned/deletable sidecar data, and `generic-game-stream-runner-validation-contract-2026-05-19.md` for one-shot runtime intent/status behavior.
