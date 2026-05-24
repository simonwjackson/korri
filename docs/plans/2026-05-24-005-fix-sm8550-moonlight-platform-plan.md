---
title: fix: Bake SM8550 Moonlight video platform config
type: fix
status: completed
date: 2026-05-24
---

# fix: Bake SM8550 Moonlight video platform config

## Summary

Bake the validated SM8550 Moonlight playback environment into Korri’s RockNix platform adapter instead of relying on live `/run` systemd drop-ins. The implementation keeps Moonlight launch code generic and proves the final kiosk service environment through existing RockNix eval tests.

---

## Problem Frame

Sobo’s live Moonlight stream reached an “audio but no video” state even after `/dev/video*` existed in the guest because `moonlight-embedded` auto-selected a non-working DRM path. A temporary guest service drop-in setting `KORRI_MOONLIGHT_PLATFORM=v4l2m2m` and `SDL_VIDEODRIVER=wayland` fixed the live session, but those runtime-only drop-ins disappear on reboot and do not protect the committed RockNix appliance composition.

---

## Requirements

- R1. SM8550 RockNix kiosk appliances must launch Moonlight Embedded with the validated V4L2 M2M platform path.
- R2. The Wayland SDL video driver setting required by the validated SM8550 playback path must be part of the durable kiosk service environment.
- R3. Hardware/substrate video facts must stay in the RockNix SM8550 platform adapter, not in generic Korri app or Moonlight launcher code.
- R4. Regression coverage must assert the final Thor and Sobo/Odin 2 Portal kiosk service environments contain the required Moonlight video settings.
- R5. The plan must not claim to solve host `/dev/video*` passthrough; that remains a separate RockNix/nix-on-rocks substrate update and device rollout concern.

---

## Scope Boundaries

- Do not modify `korri/products/app/stream/moonlight-launcher.ts` to hard-code SM8550, Iris, V4L2, Thor, Sobo, Odin, or RockNix knowledge.
- Do not modify nix-on-rocks, apply the full ROCKNIX host update, reboot Sobo, or replace the temporary live device patches as part of this plan.
- Do not tune stream quality, bitrate, resolution, FPS, encoder policy, pairing, or remote launch UX.
- Do not generalize the `v4l2m2m` setting to x86 kiosk images or generic Korri kiosk modules.

### Deferred to Follow-Up Work

- Bake and deploy the host substrate `/dev/video*` passthrough update through the nix-on-rocks/ROCKNIX path, then remove the live host drop-in after a confirmed reboot-safe update.
- Run physical Sobo/Thor acceptance after the committed Korri config is included in a real image/rootfs; Nix eval can prove environment wiring but not the live Iris decoder path.

---

## Context & Research

### Relevant Code and Patterns

- `nix/images/platforms/rocknix-sm8550.nix` is the platform adapter for Thor and Sobo/Odin 2 Portal. It already sets SM8550 kiosk environment such as `KORRI_MOONLIGHT_COMMAND`, `KORRI_MOONLIGHT_CLIENT`, `KORRI_MOONLIGHT_MAPPING_FILE`, and `KORRI_MOONLIGHT_STARTUP_OBSERVE_MS`.
- `korri/products/app/stream/moonlight-launcher.ts` already reads `KORRI_MOONLIGHT_PLATFORM` and passes it as Moonlight’s `-platform` argument. That existing seam is the right app boundary; the fix is configuration, not launcher specialization.
- `tools/testing/nix/korri-rocknix-image-eval.fixture.nix` and `tools/testing/nix/korri-rocknix-image-eval.test.ts` already evaluate Thor and Sobo RockNix appliance outputs and assert kiosk/session invariants.
- `docs/deployment/korri-images.md` defines the platform adapter seam: generic Korri image helpers stay product-level, while RockNix SM8550 facts live in the RockNix platform adapter boundary.
- `.github/workflows/desktop-stage2.yml` already runs the RockNix image eval test in CI, so extending that test gives this fix PR-time coverage without adding a new workflow surface.

### Institutional Learnings

- `docs/solutions/architecture-patterns/boot-scoped-control-plane-with-session-scoped-runner-2026-05-19.md`: prove service environment and lifecycle contracts with real Nix eval where possible, rather than relying on runtime memory of a working system.
- `docs/solutions/workflow-issues/generic-game-stream-runner-validation-contract-2026-05-19.md`: Moonlight/Sunshine failures are often environment-contract failures; keep the stream runner and launcher generic and configure the platform-specific environment at the owning seam.
- `docs/solutions/integration-issues/runtime-mask-essway-to-stop-emulationstation-relaunching-during-odin-kiosk-sessions-2026-05-03.md`: runtime systemd changes are useful diagnostics, but durable fixes belong in committed configuration.
- `docs/solutions/integration-issues/one-command-odin-electrobun-deploy-needs-device-nix-and-session-env-2026-05-06.md`: systemd-launched kiosk processes must receive explicit display/session environment; do not assume interactive shell state carries into services.

### External References

- External nix-on-rocks acceptance evidence from the handoff should be treated as supporting context for the chosen SM8550 playback path, not as a Korri repo dependency. Reference nix-on-rocks repo-relative docs in review discussion if needed, without copying them into Korri.

---

## Key Technical Decisions

- Put `KORRI_MOONLIGHT_PLATFORM = "v4l2m2m"` in `nix/images/platforms/rocknix-sm8550.nix`: the decoder/platform choice is an SM8550 substrate fact and that file already owns Moonlight Embedded configuration for Thor and Sobo.
- Put `SDL_VIDEODRIVER = "wayland"` in the same kiosk environment: the validated presentation path used Wayland SDL output, and systemd-launched kiosk services need explicit session/display environment rather than implicit shell state.
- Assert the final `systemd.services."korri-kiosk".environment`, not only `services.korri.kiosk.environment`: this proves the values reach the runtime service boundary that launches the Korri client and Moonlight bridge.
- Keep launcher production code unchanged: the launcher’s existing generic env seam is correct, and production code should not gain device-specific branches.

---

## Open Questions

### Resolved During Planning

- Should the fix live in the app launcher? No. The launcher already has a generic platform env seam, and hard-coding SM8550 in TypeScript would violate the platform adapter boundary.
- Should the fix live in generic kiosk modules? No. `v4l2m2m` is not a generic kiosk default; it is specific to the current RockNix SM8550 Moonlight Embedded path.
- Should Korri plan the host `/dev/video*` passthrough update here? No. That is a separate nix-on-rocks/ROCKNIX substrate update and rollout concern.
- Is external framework research needed? No. The repo already has direct platform Nix patterns and eval-test coverage for this exact appliance surface.

### Deferred to Implementation

- Exact grouping of assertions in `tools/testing/nix/korri-rocknix-image-eval.test.ts`: implementation may add a new focused test or extend the existing constrained-session test, as long as failures identify the missing video environment clearly.

---

## Implementation Units

### U1. Add durable SM8550 Moonlight video environment

**Goal:** Encode the live-validated Moonlight video platform and SDL presentation settings in the committed RockNix SM8550 kiosk environment.

**Requirements:** R1, R2, R3, R5

**Dependencies:** None

**Files:**
- Modify: `nix/images/platforms/rocknix-sm8550.nix`
- Test: `tools/testing/nix/korri-rocknix-image-eval.test.ts` (owned by U2)

**Approach:**
- Add the Moonlight platform and SDL video driver values to the existing `services.korri.kiosk.environment` block beside the other Moonlight Embedded environment values.
- Keep the values inside the SM8550 platform adapter so Thor and Sobo/Odin 2 Portal inherit them together through their shared substrate boundary.
- Do not alter `nix/modules/korri-kiosk.nix`, `nix/images/platforms/x86.nix`, or generic app launch code for this hardware-specific decoder fact.

**Execution note:** Start with the focused eval assertion from U2 if implementing test-first; the expected failure should be missing `moonlightPlatform` / `sdlVideoDriver` for Thor and Sobo.

**Patterns to follow:**
- Existing Moonlight env entries in `nix/images/platforms/rocknix-sm8550.nix`.
- Platform adapter ownership described in `docs/deployment/korri-images.md`.

**Test scenarios:**
- Happy path: evaluating Thor’s RockNix appliance summary reports `KORRI_MOONLIGHT_PLATFORM` as `v4l2m2m` and `SDL_VIDEODRIVER` as `wayland` in the final kiosk service environment.
- Happy path: evaluating Sobo/Odin 2 Portal’s RockNix appliance summary reports the same two values in the final kiosk service environment.
- Edge case: generic image modules remain free of SM8550/RockNix facts after the platform env is added.
- Integration: the platform env coexists with existing Moonlight command, mapping file, startup observe window, and InputPlumber-required settings for the same appliance target.

**Verification:**
- The committed RockNix SM8550 Nix config would launch the kiosk with the validated Moonlight Embedded platform and SDL video driver settings after rebuild.
- No generic kiosk or x86 defaults acquire SM8550-specific video behavior.

---

### U2. Extend RockNix image eval coverage for video env

**Goal:** Make the required SM8550 Moonlight video settings fail loudly during repo validation if future changes drop or mis-scope them.

**Requirements:** R1, R2, R4

**Dependencies:** U1 can be implemented in the same commit, but the assertion design should target the final service environment before adding the values.

**Files:**
- Modify: `tools/testing/nix/korri-rocknix-image-eval.fixture.nix`
- Modify: `tools/testing/nix/korri-rocknix-image-eval.test.ts`

**Approach:**
- Add fixture summary fields sourced from `eval.config.systemd.services."korri-kiosk".environment`, not only from the higher-level service option.
- Assert both `result.thor` and `result.sobo` carry `moonlightPlatform = "v4l2m2m"` and `sdlVideoDriver = "wayland"`.
- Keep the assertion near the existing constrained RockNix kiosk session test or add a focused Moonlight video environment test so failures point to the platform playback contract.

**Patterns to follow:**
- Existing `moonlightCommand`, `moonlightMappingFile`, and `moonlightRequireInputPlumber` fixture/test fields in `tools/testing/nix/korri-rocknix-image-eval.*`.
- The real-`nix eval` posture from `docs/solutions/architecture-patterns/boot-scoped-control-plane-with-session-scoped-runner-2026-05-19.md`.

**Test scenarios:**
- Happy path: the fixture JSON includes the final systemd kiosk environment values for each explicit SM8550 target.
- Error path: if either target omits `KORRI_MOONLIGHT_PLATFORM`, the test fails with the missing or null value visible in the expectation diff.
- Error path: if either target omits `SDL_VIDEODRIVER`, the test fails with the missing or null value visible in the expectation diff.
- Integration: the existing CI path that runs `tools/testing/nix/korri-rocknix-image-eval.test.ts` covers the new assertions without adding a new workflow job.

**Verification:**
- RockNix image eval coverage proves the committed appliance composition emits the required final service environment for both Thor and Sobo/Odin 2 Portal.

---

## System-Wide Impact

- **Interaction graph:** `nix/images/platforms/rocknix-sm8550.nix` supplies the kiosk environment; `nix/modules/korri-kiosk.nix` emits the final `korri-kiosk` systemd service; the Korri client launch bridge eventually calls the generic Moonlight launcher, which reads `KORRI_MOONLIGHT_PLATFORM` and passes it to Moonlight Embedded.
- **Error propagation:** Missing env values will be caught by Nix eval tests before runtime. Live stream failures caused by absent `/dev/video*` remain runtime/device rollout failures outside this Korri config fix.
- **State lifecycle risks:** No persistent app state or migrations are involved. The main lifecycle risk is confusing temporary `/run` drop-ins with committed Nix config; this plan moves the guest env into durable composition but does not remove live patches.
- **API surface parity:** No RPC, CLI flag, or UI API changes are expected. The only contract surface is service environment consumed by the existing launcher/Moonlight path.
- **Integration coverage:** Unit/eval tests prove final service environment. They do not prove physical decoder availability, Iris driver selection, or Sway toplevel presentation; those require later device acceptance.
- **Unchanged invariants:** Generic Korri kiosk modules, x86 images, Moonlight pairing behavior, InputPlumber normalization, and nix-on-rocks host video passthrough remain unchanged by this plan.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| The Korri config fix is mistaken for the whole Sobo video fix. | Scope boundaries state that host `/dev/video*` passthrough is separate and still requires nix-on-rocks/ROCKNIX rollout validation. |
| The env is asserted at the wrong layer and never reaches the runtime service. | U2 explicitly sources assertions from `systemd.services."korri-kiosk".environment`. |
| Device-specific video behavior leaks into shared launcher code. | U1 scopes config to `nix/images/platforms/rocknix-sm8550.nix`; key decisions state that launcher production code remains generic and unchanged. |
| The same setting is accidentally applied to non-SM8550 images. | Existing generic-module freedom tests should continue to run, and U1 includes a scenario to preserve generic/x86 boundaries. |
| Nix eval passes but live Moonlight still fails due missing video devices or substrate drift. | Treat physical Sobo/Thor smoke as follow-up acceptance, not as proven by this repo-local plan. |

---

## Documentation / Operational Notes

- The implementation should leave temporary scripts such as `TEMP-pass-sobo-video.sh` out of committed config unless a separate operator workflow explicitly adopts them.
- Device rollout, full host update, and reboot decisions are visible shared-state operations and require a separate explicit user confirmation before execution.
- If the nix-on-rocks host update lands first, this Korri plan is still needed so future Korri rootfs/image builds carry the guest Moonlight platform setting after reboot.

---

## Sources & References

- Session handoff: temporary Sobo runtime patches and permanent SM8550 Korri config follow-up.
- Related code: `nix/images/platforms/rocknix-sm8550.nix`
- Related tests: `tools/testing/nix/korri-rocknix-image-eval.fixture.nix`, `tools/testing/nix/korri-rocknix-image-eval.test.ts`
- Related docs: `docs/deployment/korri-images.md`
- Related external repo evidence: nix-on-rocks `docs/solutions/tooling-decisions/moonlight-embedded-sm8550-v4l2m2m-supported-path-sobo-2026-05-23.md`, nix-on-rocks `docs/acceptance/moonlight-embedded-v4l2m2m-sobo-2026-05-23.md`
