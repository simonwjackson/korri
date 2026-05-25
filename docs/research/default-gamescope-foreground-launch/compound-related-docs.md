# Related Docs Finder — Korri kiosk foreground app policy

## Scope searched

Searched `docs/solutions/` for: foreground, kiosk, Sway, Gamescope, Moonlight, sessiond, fullscreen, overlay, workspace, foreground app, Korri hub. Checked strong related solution docs and selected `docs/plans/` / `docs/brainstorms/` cross-reference candidates. GitHub issue search skipped because `gh` is not installed in this environment.

## Existing solution docs found

### `docs/solutions/integration-issues/supervise-chromium-kiosk-session-after-game-exit-2026-05-04.md`

**Relevance: high.** This is the closest existing learning. It states the same architectural lesson in an older Odin/Chromium context: kiosk presentation is a session invariant, not a launch flag. It documents `sessiond`, Sway tree/window reconciliation, focus/fullscreen/borderless repair, and explicit home/game/restoring modes.

Useful details to cross-reference:

- “Chromium becomes the renderer, not the session owner.”
- “When no game is running, exactly one Korri Chromium app window exists, it is focused, fullscreen…”
- Prevention rules: treat kiosk/chromeless mode as a session invariant; put launch lifecycle under the supervisor; suspend home focus repair while a game is running.

Why it is not a complete duplicate:

- It is bug-track and Odin/Chromium/EmulationStation-specific.
- It focuses on returning Korri after game exit, not on arbitrary new app windows launched from the current Electrobun/Moonlight path being tiled beside Korri.
- It does not discuss Gamescope as an optional adapter vs universal overlay mechanism.
- File references are the older `tools/odin/sessiond-*` shape, while current code references are `tools/device/sessiond*`, `nix/modules/korri-kiosk.nix`, and `korri/deploy/desktop/launch-bridge.ts`.

### `docs/solutions/workflow-issues/generic-game-stream-runner-validation-contract-2026-05-19.md`

**Relevance: moderate.** This captures the generic Sunshine/Moonlight stream-runner contract and repeatedly uses “foreground app/runner” language. It also includes a `gamescope` tag and explains that Sunshine should expose one stable foreground app (`Korri Stream`) while the runner launches arbitrary `LaunchSpec`s.

Useful details to cross-reference:

- The foreground runner is deliberately generic; Sunshine should not become a per-game launcher.
- Fresh launch intent per session is the validation contract.
- Moonlight/Sunshine failures are often environment-contract failures rather than runner defects.

Why it is not a duplicate:

- It is about the remote host’s Sunshine-launched runner, not the local kiosk client’s Sway window policy.
- It does not cover Korri and Moonlight being siblings in one Sway workspace.
- It does not define a local kiosk foreground-surface policy.

### `docs/solutions/architecture-patterns/boot-scoped-control-plane-with-session-scoped-runner-2026-05-19.md`

**Relevance: low to moderate.** Related architecture pattern for keeping a boot-scoped `korri-server` control plane separate from a session-scoped runner. The lifecycle-boundary lesson supports the proposed doc’s “foreground policy belongs to kiosk/session management, not Moonlight/Gamescope” framing.

Why it is not a duplicate:

- It focuses on systemd service scope, runtime dirs, ownership, and launch-intent trust contracts.
- It does not cover compositor foreground/window presentation.

### `docs/solutions/integration-issues/one-command-odin-electrobun-deploy-needs-device-nix-and-session-env-2026-05-06.md`

**Relevance: low to moderate.** Useful supporting lesson: systemd-launched session tools need explicit Wayland/Sway environment (`DISPLAY`, `XDG_RUNTIME_DIR`, `WAYLAND_DISPLAY`, `SWAYSOCK`) for Electrobun and `swaymsg` reconciliation.

Why it is not a duplicate:

- It is a deployment/env convergence issue, not a foreground app policy.
- It can be referenced only for implementation guidance if the new policy uses `swaymsg`/sessiond from a systemd service.

### `docs/solutions/integration-issues/runtime-mask-essway-to-stop-emulationstation-relaunching-during-odin-kiosk-sessions-2026-05-03.md`

**Relevance: low.** Shares the theme “identify the real runtime owner before trying to fix visible session behavior.” Useful historical context for Odin/ROCKNIX session ownership.

Why it is not a duplicate:

- Current Sobo/Korri guest has no EmulationStation/`essway` ownership conflict in the observed problem.
- The symptom here is Sway tiling a new local Moonlight window, not another service reclaiming the screen.

## Related non-solution docs worth cross-linking

### `docs/plans/2026-05-04-004-feat-odin-chromium-session-supervisor-plan.md`

Strong historical source for the session-invariant design. It explicitly says the supervisor owns Sway reconciliation and that `--kiosk` / fullscreen flags are launch hints, not lifecycle enforcement. It also captures the state-machine shape: home, launching, game, restoring, recovering.

### `docs/plans/2026-05-21-003-refactor-korri-kiosk-modules-plan.md`

Strong cross-reference for current Nix ownership boundaries. It establishes `services.korri.kiosk` as the product-owned kiosk/session entrypoint and keeps hardware/platform fragments in platform adapters. The new doc should align with this: foreground app policy belongs in kiosk/session management, not platform-specific Moonlight launcher code.

### `docs/plans/2026-05-24-005-fix-sm8550-moonlight-platform-plan.md`

Useful Sobo-specific context. It captures the separate durable fix for `KORRI_MOONLIGHT_PLATFORM=v4l2m2m` and `SDL_VIDEODRIVER=wayland`, while explicitly saying it does not prove Sway toplevel presentation. The new foreground-policy doc should reference it as adjacent but distinct: video decode/presentation environment is not the same as compositor foreground policy.

### `docs/plans/2026-05-21-002-refactor-desktop-input-broker-plan.md`

Useful for input implications. It states that Korri UI input should be active-window scoped, should not use global keyboard injection, and should not affect Moonlight/games when Korri is inactive. A foreground-app policy must preserve that safety boundary.

### `docs/brainstorms/2026-05-18-headless-game-stream-orchestration-requirements.md`

Useful for Gamescope framing. It explicitly says Gamescope may be used if it helps fullscreen/session behavior, but Gamescope itself is not the product requirement. That aligns with the current conclusion: Gamescope is an optional presentation adapter, not the foreground policy.

### `docs/brainstorms/2026-05-23-001-x86-live-usb-kiosk-requirements.md`

Useful for future x86 comparison. It makes local Moonlight launch part of the kiosk acceptance path and assumes Moonlight pairing already exists. The proposed doc can note that x86 may appear better today because Moonlight/backend behavior differs, not because a generic kiosk foreground policy is already documented.

## Refresh candidates

### `docs/solutions/integration-issues/supervise-chromium-kiosk-session-after-game-exit-2026-05-04.md`

Potentially refresh with a short note or related link after the new doc exists. The existing doc is not contradicted, but it is old and Odin/Chromium-specific. A new doc would generalize the same architectural lesson to current Korri kiosk/Electrobun/Moonlight surfaces; adding a Related link from the old doc would improve discoverability.

### `docs/solutions/workflow-issues/generic-game-stream-runner-validation-contract-2026-05-19.md`

No contradiction. Consider adding a Related link only if the new doc discusses how foreground app policy interacts with the generic runner or Gamescope wrapper. Do not update otherwise.

No existing solution doc appears stale or contradicted by the Gamescope challenge. The current conclusion narrows Gamescope’s role but does not invalidate the older “Gamescope allowed as helper” language in brainstorms/plans.

## Overlap assessment

Overall overlap with a proposed new knowledge doc: **Moderate**.

Dimension-by-dimension:

1. **Problem statement: Moderate**
   - Existing `supervise-chromium-kiosk-session...` covers unreliable kiosk/fullscreen behavior after app/game handoff.
   - New topic is narrower/different: Sobo Moonlight is launched locally from Korri and becomes a tiled sibling to Korri.

2. **Root cause / architecture gap: High**
   - Existing doc’s core lesson is the same: compositor presentation is an owned session invariant, not a property of app flags.
   - Current root cause adds a new concrete gap: generated `services.korri.kiosk` Sway config lacks any foreground-app/window policy, and the Moonlight launch path bypasses `sessiond`/foreground repair.

3. **Solution approach: Moderate**
   - Existing doc recommends `sessiond` + Sway focus/fullscreen reconciliation.
   - New doc should evaluate multiple generic foreground strategies (`workspace_layout tabbed`, foreground workspace, session manager foreground mode, optional Gamescope wrapper) and explicitly reject Gamescope as the universal outer overlay mechanism.

4. **Referenced files: Low to Moderate**
   - Existing docs reference older Odin paths (`tools/odin/sessiond-*`, scripts) and generic stream runner files.
   - New doc should reference current code/docs: `nix/modules/korri-kiosk.nix`, `nix/images/platforms/rocknix-sm8550.nix`, `nix/images/platforms/x86.nix`, `korri/deploy/desktop/launch-bridge.ts`, `korri/products/app/stream/moonlight-launcher.ts`, `tools/device/sessiond.ts`, `tools/device/sessiond-sway.ts`, `tools/device/game-stream-fullscreen.ts`.

5. **Prevention / guidance rules: High**
   - Existing docs already advise treating kiosk state as a session invariant and keeping lifecycle ownership explicit.
   - New doc should add specific prevention guidance: do not treat Gamescope as outer-window policy; do not grow app-id-specific `for_window` rule piles as the primary architecture; route arbitrary app launches through a foreground-session owner.

## Recommendation

**Create a new solution doc** rather than updating an existing one.

Suggested classification:

- Track: knowledge
- `problem_type`: `architecture_pattern` or `best_practice`; prefer `architecture_pattern` because the conclusion is about responsibility placement across kiosk/session manager, Sway, Moonlight, and Gamescope.
- Category: `docs/solutions/architecture-patterns/`
- Suggested filename: `kiosk-foreground-app-policy-over-gamescope-overlay-2026-05-24.md`

Rationale:

- The closest existing doc is high-relevance but not same problem/scope/device/runtime. Updating it would either overload an Odin/Chromium bug-track doc with a broader current architecture pattern or bury the Gamescope-specific challenge in the wrong place.
- A new architecture-pattern doc can cross-link the older session supervisor learning as precedent while capturing the current Sobo/Moonlight evidence and the refined Gamescope position.
- After creation, consider adding a small Related link to `supervise-chromium-kiosk-session-after-game-exit-2026-05-04.md` for bidirectional discoverability.
