---
title: feat: Standardize handheld audio baseline
type: feat
status: completed
date: 2026-06-22
verify_command: "nix build .#checks.x86_64-linux.korri-sm8550-kiosk-config .#checks.x86_64-linux.korri-rk3566-kiosk-config --no-link && bun test product/plugins/retroarch/src/launch-spec.test.ts"
---

# feat: Standardize handheld audio baseline

## Summary

Standardize Bandai, Sobo, and RG353M around the same handheld audio contract: game and app audio routes through the device's PipeWire/Pulse default sink, hardware volume buttons adjust that graph-level sink, and boot starts from a low safe volume. The plan keeps launcher policy out of hardware-specific ALSA device paths, strengthens Nix checks around the platform adapters, and treats per-device substrate facts as the source of hardware detail.

---

## Problem Frame

Sobo validation showed that `pactl` volume readings can be misleading when a launcher forces RetroArch directly to a hardware ALSA device: the sink may report 1-3% while the speaker output feels like 100%. The validated fix was to remove the hardware `audio_device` override, let RetroArch route into PipeWire/Pulse, and keep inputd volume buttons on `pactl @DEFAULT_SINK@`. The user wants that behavior across all handhelds: Bandai, Sobo, and RG353M.

---

## Requirements

- R1. Bandai, Sobo, and RG353M must route normal game/app audio through the intended PipeWire/Pulse graph rather than direct hardware ALSA device overrides.
- R2. Hardware volume buttons must adjust the active default sink via inputd's graph-level `pactl @DEFAULT_SINK@` behavior on each handheld.
- R3. Handheld boot/default audio must start at a safe low volume before foreground launches can produce sound.
- R4. RetroArch platform policy must not require hard-coded hardware `audio_device` values such as `sysdefault:CARD=...`.
- R5. Device-specific hardware facts, such as audio APIs, UCM paths, and sink names, must remain owned by the platform/substrate layer rather than app launchers.
- R6. The implementation must add Nix/config checks so the baseline is evaluated for SM8550 and RK3566 rather than relying only on live manual validation.
- R7. Existing display and launch invariants for SM8550 and RK3566 must remain unchanged.

---

## Scope Boundaries

- Do not make Mega Man Arena visibility or FEX/Wine windowing part of this plan; live validation showed that as a separate launch/display issue.
- Do not require every emulator to use the same internal audio backend; emulator-specific known-good backends, such as Ryubing/OpenAL, remain valid.
- Do not build a new user-facing volume UI or persistent volume preference system.
- Do not solve dynamic headphone/Bluetooth/HDMI sink switching beyond preserving PipeWire/WirePlumber as the graph owner.
- Do not hard-code new per-device ALSA card names in launcher policy to replace the old Sobo workaround.

### Deferred to Follow-Up Work

- Generalize or retire Steam/FEX `repair_game_audio` only after reproducing a non-default-sink failure on an installed Steam game; the current plan should make Steam audio intent auditable but not invent a generic repair rule.
- Fix Mega Man Arena installation/library/visibility so it can be launched normally from Sobo; the audio plan should not depend on that game becoming visible.
- Resolve stale Sobo parking-lot items that requested direct ALSA RetroArch audio once the durable no-hardware-override path has landed and been deployed.

---

## Context & Research

### Relevant Code and Patterns

- `product/systems/nixos/images/platforms/rocknix-sm8550.nix` already contains the closest target pattern: user-session PipeWire/Pulse, `PULSE_SERVER = "unix:%t/pulse/native"`, a `korri-sm8550-audio-bootstrap` oneshot, inputd Pulse env, sessiond Pulse env, and disabled root main-space audio services.
- `product/systems/nixos/images/platforms/rocknix-rk3566.nix` is the main gap: RG353M currently has display/session/platform defaults but no explicit audio posture, no safe boot volume service, and no explicit inputd/sessiond `PULSE_SERVER`.
- `product/services/device/inputd-actions.ts` already defaults volume buttons to `pactl set-sink-volume @DEFAULT_SINK@ +/-5%`; platform units should prefer setting the correct `PULSE_SERVER` instead of overriding `KORRI_INPUTD_VOLUME_UP`/`DOWN`.
- `product/plugins/retroarch/src/launch-spec.ts` only writes `audio_driver` and `audio_device` when policy provides them; omitting both generated the validated Sobo behavior and left RetroArch routed into PipeWire/Pulse.
- `tools/testing/nix/korri-rocknix-sm8550-config-check.nix` already asserts SM8550 audio graph, bootstrap ordering, inputd Pulse env, and absence of volume command overrides.
- `tools/testing/nix/korri-rocknix-rk3566-config-check.nix` has no audio assertions yet and should mirror the SM8550 style for RG353M-appropriate invariants.
- `product/plugins/steam/nix/nixos-module.nix` owns Steam/FEX/Gamescope services; audio env there should be auditable because those launches can originate outside the normal user-service path.

### Institutional Learnings

- `docs/solutions/performance-issues/ryubing-sm8550-turnip26-openal-2026-06-11.md`: do not assume every audio problem is PipeWire; emulator internal backends can be the real cause. Preserve known-good per-emulator backend policy.
- `docs/solutions/runtime-errors/gamescope-backend-auto-fights-sway-for-drm-master-2026-05-27.md`: audio reaching PipeWire while display is absent is a display/foregrounding signal, not proof of audio failure.
- `docs/solutions/architecture-patterns/architectural-posture-as-nix-image-default-2026-05-27.md`: platform posture belongs in image/platform adapters rather than generic modules when it depends on deployment topology.
- `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md`: audio API and launch policy should be explicit substrate/platform facts, not runtime heuristics.

### External References

- External research was skipped. The codebase already has strong local patterns for NixOS platform adapters, PipeWire/Pulse service wiring, inputd command defaults, and RetroArch config generation.

---

## Key Technical Decisions

- Use PipeWire/Pulse default-sink control as the cross-handheld contract: inputd already has the right `pactl @DEFAULT_SINK@` fallback, so platform adapters should supply the correct socket/env instead of per-device shell wrappers.
- Keep RetroArch hardware audio devices out of launcher policy: the Sobo failure mode came from forcing `audio_device = sysdefault:CARD=AYNOdin2`; omitting `audio_driver` and `audio_device` was validated on GBA/mGBA and NES/mesen.
- Treat SM8550 and RK3566 separately at the platform adapter layer: Bandai/Sobo run through the SM8550 rootless Korri user session, while RG353M currently has different compositor/session ownership and must be made explicit rather than blindly copying `%t` assumptions.
- Start handhelds at a low boot/default volume: 10% is the planned durable default because inputd steps are 5% and the session should never surprise-blast before the operator presses a button.
- Add checks before relying on live memory: SM8550 already has rich Nix eval checks; RG353M needs equivalent audio invariants so the desired behavior survives rebuilds and device profile changes.
- Avoid turning the Steam/FEX repair workaround into a general rule without evidence: make Pulse env explicit for Steam services, but defer generic `pw-link` repair until a non-default-sink failure is reproduced.

---

## Open Questions

### Resolved During Planning

- Should this apply to only Sobo or all devices? Resolved by the user: all handheld devices, specifically Bandai, Sobo, and RG353M.
- Should RetroArch require `audio_driver = pipewire`? Live Sobo validation resolved that omitting both `audio_driver` and `audio_device` is acceptable: RetroArch produced a PipeWire sink input and volume buttons worked.
- Should boot volume be low even if it overrides prior user volume? Resolved as a safety invariant for handheld appliance boot; the plan uses a low boot/default clamp rather than restoring a potentially loud remembered volume.

### Deferred to Implementation

- Exact RG353M hardware behavior after deployment: planning resolves the intended graph as the existing root/main-space Pulse socket at `/run/user/0/pulse/native`, but hardware validation should still confirm that the generated service env and live socket agree.
- Whether RetroArch should get an explicit `pulse`/`pipewire` platform driver on any device: defer until the implementer inspects the built RetroArch feature set and confirms omission remains correct in evaluated/generated configs.
- Whether Steam/FEX needs generalized audio repair: defer until a real Steam game or non-Mega-Man FEX game reproduces audio not following the default sink.

---

## Implementation Units

### U1. Codify SM8550 safe-volume and no-override invariants

**Goal:** Make the validated Bandai/Sobo behavior durable in the SM8550 platform adapter and checks: user-session PipeWire/Pulse is authoritative, boot volume is safe, inputd uses built-in `pactl`, and RetroArch has no hardware ALSA override in platform-generated policy.

**Requirements:** R1, R2, R3, R4, R6, R7

**Dependencies:** None

**Files:**
- Modify: `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- Modify: `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
- Test: `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`

**Approach:**
- Keep the existing SM8550 architecture: root main-space audio disabled, Korri runtime user owns PipeWire/Pulse, audio services get substrate UCM env, and inputd/sessiond target `unix:%t/pulse/native`.
- Ensure the audio bootstrap always applies a low safe volume to the final default sink, including paths where no substrate UCM/PCM sink is declared and WirePlumber owns sink selection.
- Add or tighten check coverage so the bootstrap safe-volume script path is detectable, inputd has `pactl` available, volume override env vars are absent, and sessiond launches inherit the user Pulse socket.
- Treat mutable live Sobo files such as `/var/lib/korri/config/local.korri.yaml` as deployment state, not source of truth; the repo should prevent regeneration of the problematic hardware override rather than committing the mutable file.

**Execution note:** Characterization-first: add/adjust the SM8550 Nix eval assertions before changing the platform adapter further, using the existing config-check style.

**Patterns to follow:**
- `tools/testing/nix/korri-rocknix-sm8550-config-check.nix` audio assertions around `pipewireEnv`, `audioBootstrapUnit`, `sessiondEnv`, and `inputdEnv`.
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix` `korri-sm8550-audio-bootstrap` service ordering.

**Test scenarios:**
- Happy path: evaluated Thor/Bandai and Sobo SM8550 configs expose `korri-sm8550-audio-bootstrap` before `korri-sessiond.service` and `korri-inputd.service` with `PULSE_SERVER = "unix:%t/pulse/native"`.
- Happy path: evaluated SM8550 inputd has no `KORRI_INPUTD_VOLUME_UP` or `KORRI_INPUTD_VOLUME_DOWN` overrides and has `pulseaudio`/`pactl` available in its path.
- Integration: evaluated SM8550 sessiond and inputd agree on the same user-session Pulse socket so launched games and hardware buttons operate on the same graph.
- Edge case: substrate-declared UCM/PCM facts may be absent; the bootstrap still contains a final low-volume default-sink clamp.
- Regression: platform defaults do not introduce a hard-coded RetroArch `audio_device` for SM8550.

**Verification:**
- SM8550 Nix config checks pass and explicitly cover low boot/default volume, inputd `pactl`, and user-session Pulse socket inheritance.
- Generated/dry-run RetroArch config for a normal SM8550 launch contains no hardware `audio_device` override unless the user explicitly configured one outside platform defaults.

---

### U2. Add RG353M/RK3566 audio posture

**Goal:** Give RG353M the same product-level audio contract as SM8550 while respecting its different platform topology: foreground launches and inputd must target the correct PipeWire/Pulse graph, and boot must clamp default volume before games can launch.

**Requirements:** R1, R2, R3, R5, R6, R7

**Dependencies:** U1 for the shared invariant pattern.

**Files:**
- Modify: `product/systems/nixos/images/platforms/rocknix-rk3566.nix`
- Modify: `tools/testing/nix/korri-rocknix-rk3566-config-check.nix`
- Test: `tools/testing/nix/korri-rocknix-rk3566-config-check.nix`

**Approach:**
- Encode the current RG353M topology explicitly: RK3566 runs the compositor/session path through the root user context and the substrate main-space PipeWire/Pulse graph at `/run/user/0/pulse/native`.
- Add a small RK3566 audio bootstrap that extends the existing main-space graph posture instead of replacing it with SM8550 rootless ownership. Its minimum responsibility is polling the root Pulse socket and setting `@DEFAULT_SINK@` to the safe low volume before Korri foreground services start.
- Set inputd and sessiond environments so hardware buttons and launched games address `unix:/run/user/0/pulse/native` rather than relying on libpulse autodiscovery.
- Keep RG353M's existing Gamescope Xwayland platform default unchanged; do not add an `apps.retroarch` record.
- If RetroArch needs explicit audio backend policy after evaluating `retroarch-bare` features, inject host-layer plugin policy rather than app-level launcher records.

**Execution note:** Characterization-first: start with Nix eval assertions for the current RG353M topology, then change the platform adapter to satisfy the target audio contract.

**Patterns to follow:**
- `product/systems/nixos/images/platforms/rocknix-rk3566.nix` existing `panfrostEnvironment`, sessiond `extraEnvironment`, and host Gamescope platform-default structure.
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix` audio bootstrap ordering and inputd/sessiond Pulse env pattern.
- `tools/testing/nix/korri-rocknix-rk3566-config-check.nix` existing rendered platform-default checks.

**Test scenarios:**
- Happy path: evaluated RG353M config has an audio bootstrap service wanted by `korri-session.target`, ordered after PipeWire/Pulse/WirePlumber and before compositor/sessiond/inputd.
- Happy path: evaluated RG353M inputd environment targets `unix:/run/user/0/pulse/native` and does not override volume commands away from inputd's built-in `pactl` behavior.
- Happy path: evaluated RG353M sessiond launches inherit `unix:/run/user/0/pulse/native`, matching inputd.
- Integration: rendered platform defaults still unset `WAYLAND_DISPLAY` at the host Gamescope app layer and still do not define an `apps.retroarch` record.
- Edge case: if RG353M has no declared UCM/default-sink substrate facts, the bootstrap remains a safe-volume clamp only and does not invent a hardware sink name.
- Regression: the RG353M platform adapter does not hard-code SM8550-specific sink names, UCM profile strings, or AYN card names.

**Verification:**
- RK3566 Nix config check fails before and passes after the RG353M audio posture is encoded.
- Evaluated RG353M service env demonstrates that `inputd`, `sessiond`, and the audio bootstrap all target `unix:/run/user/0/pulse/native`.

---

### U3. Guard RetroArch launch policy against hardware audio bypass

**Goal:** Ensure platform-generated RetroArch launches for handhelds do not reintroduce direct hardware ALSA routing and preserve the validated behavior where omission of `audio_driver`/`audio_device` routes through PipeWire/Pulse.

**Requirements:** R1, R4, R5, R6, R7

**Dependencies:** U1, U2 for platform audio env; implementation-time evaluation of RetroArch backend capabilities.

**Files:**
- Modify: `product/plugins/retroarch/src/launch-spec.test.ts`
- Modify as needed: `product/plugins/retroarch/src/launch-spec.ts`
- Modify as needed: `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- Modify as needed: `product/systems/nixos/images/platforms/rocknix-rk3566.nix`
- Test: `product/plugins/retroarch/src/launch-spec.test.ts`
- Test: `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
- Test: `tools/testing/nix/korri-rocknix-rk3566-config-check.nix`

**Approach:**
- Preserve the current materializer behavior where absent `drivers.audio` and absent `audio.device` render no `audio_driver` or `audio_device` keys.
- Add focused test coverage documenting that omission is intentional and that `audio.device` is only emitted when explicitly configured.
- Add Nix-level assertions that platform defaults for SM8550 and RK3566/RG353M do not contain hardware `audio_device` values or app-level RetroArch records.
- If implementation discovers a platform must force a backend, prefer host-layer plugin policy for a generic graph backend such as Pulse/PipeWire and test that choice; do not encode hardware card names.

**Patterns to follow:**
- `product/plugins/retroarch/src/launch-spec.ts` typed setting emission via `pushTypedSetting` and `AUDIO_SETTINGS`.
- `product/plugins/retroarch/src/launch-spec.test.ts` stable group-order and driver rendering tests.
- `product/systems/nixos/images/platforms/rocknix-rk3566.nix` comment that platform defaults must not define `apps.retroarch`.

**Test scenarios:**
- Happy path: rendering a RetroArch policy with no audio driver/device omits both `audio_driver` and `audio_device` from the generated config.
- Happy path: rendering a policy with an explicit graph backend still emits `audio_driver` correctly.
- Edge case: rendering `audio.device` remains possible for an explicit user/device override, but no handheld platform default injects it.
- Integration: generated platform defaults for SM8550 and RK3566 do not include `audio_device: sysdefault:CARD=...` or an `apps.retroarch` collision.
- Regression: existing audio typed settings such as latency and output rate continue to render when configured.

**Verification:**
- Unit tests document omission semantics for `audio_driver`/`audio_device`.
- Nix checks prevent platform defaults from reintroducing hardware ALSA routing for handheld RetroArch launches.

---

### U4. Make Steam/FEX audio env auditable without broad repair logic

**Goal:** Ensure SM8550 Steam/FEX/Gamescope launched processes inherit the intended Pulse socket on Bandai/Sobo, while deferring generic PipeWire link repair until a concrete non-default-sink failure is reproduced.

**Requirements:** R1, R2, R5, R6, R7

**Dependencies:** U1 for SM8550 socket/source-of-truth.

**Files:**
- Modify: `product/plugins/steam/nix/nixos-module.nix`
- Modify: `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
- Test: `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`

**Approach:**
- Thread explicit `PULSE_SERVER`/runtime audio env into SM8550 Steam/Gamescope system services where they currently rely on `XDG_RUNTIME_DIR`-derived libpulse defaults.
- Keep existing game-specific `repair_game_audio` behavior scoped to the failure it was created for unless implementation-time validation proves a general repair is needed.
- Add checks that SM8550 Steam services expose the same user-session runtime path and Pulse socket as sessiond/inputd.
- Do not apply Steam/FEX assumptions to RG353M unless a future RG353M Steam scope exists; this unit is Bandai/Sobo only.
- Do not add Mega Man Arena to normal library scope in this unit; its visibility issue is deferred.

**Patterns to follow:**
- `product/plugins/steam/nix/nixos-module.nix` existing runtime env assembly for Steam/Gamescope services.
- `tools/testing/nix/korri-rocknix-sm8550-config-check.nix` service environment assertions.

**Test scenarios:**
- Happy path: evaluated SM8550 Steam/Gamescope services have explicit audio env pointing at the Korri user-session Pulse socket.
- Integration: Steam service runtime env remains aligned with `services.korri.steam.home`, `runtime.stateRoot`, and the session runtime dir.
- Regression: existing Steam launch lifecycle, warm service, and uinput service invariants remain unchanged.
- Deferred failure path: non-30XX PipeWire link repair remains un-generalized unless a test or live repro demonstrates a failure.

**Verification:**
- SM8550 config checks prove Steam/FEX launch services are auditable for Pulse socket routing.
- No broad `pw-link` repair behavior is introduced without a corresponding reproduced failure.

---

### U5. Device validation and documentation path

**Goal:** Provide a repeatable low-volume validation matrix and document the operational safety invariant after the repo configuration is in place.

**Requirements:** R1, R2, R3, R4, R6

**Dependencies:** U1, U2, U3; U4 for Steam/FEX validation where installed games exist.

**Files:**
- Modify as needed: `docs/deployment/korri-images.md`
- Test expectation: none -- this unit is operational validation and documentation rather than feature code.

**Approach:**
- Validate at very low volume first, with no foreground audio producers, then one known RetroArch launch per device class.
- For Sobo/Bandai, validate generated RetroArch config omits hardware `audio_device`, a PipeWire sink input appears, and volume buttons move the default sink.
- For RG353M, validate whichever Pulse socket the implementation encoded is reachable from inputd/sessiond context and that volume buttons affect a launched RetroArch sink input.
- Document the intentional 10% boot reset as a safety invariant so later work does not reintroduce unsafe remembered volume behavior.
- Leave parking-lot cleanup to the deferred follow-up after deployment validation, rather than making backlog mutation part of the implementation units.

**Patterns to follow:**
- Existing deployment documentation in `docs/deployment/korri-images.md` for substrate/product audio boundaries.
- Existing operational/deployment note style in `docs/deployment/`.

**Test scenarios:**
- Manual validation: on each reachable handheld, default sink starts low before launch, RetroArch creates a PipeWire/Pulse sink input, and hardware buttons step volume up/down against the same sink.
- Manual validation: Sobo/Bandai generated RetroArch configs contain no `audio_device = "sysdefault:CARD=..."`.
- Manual validation: RG353M volume buttons work while a RetroArch core is active.
- Manual validation: if Steam/FEX game validation is available, it starts at low volume and follows the default sink without requiring a new general repair rule.

**Verification:**
- Validation notes confirm Bandai, Sobo, and RG353M satisfy the same observable behavior, or explicitly record which device remains blocked by hardware availability.
- Direct-ALSA Sobo backlog items remain deferred until deployment validation proves the new durable baseline has replaced them.

---

## System-Wide Impact

- **Interaction graph:** Boot/session startup now has an explicit audio dependency path: PipeWire/Pulse/WirePlumber → audio bootstrap → compositor/sessiond/inputd → launched games. Inputd and sessiond must share the same Pulse socket.
- **Error propagation:** Audio bootstrap should remain fail-soft when the Pulse socket is unavailable so the appliance can still boot; checks should catch configuration drift before deployment.
- **State lifecycle risks:** Boot volume reset intentionally overwrites potentially loud restored volume state. That is a safety behavior, not a user preference feature.
- **API surface parity:** No public API changes are planned. The affected external contracts are NixOS service environments, generated platform defaults, and generated RetroArch config.
- **Integration coverage:** Nix eval checks are required because unit tests alone cannot prove systemd unit ordering, user-service environments, or platform-default cascade shape.
- **Unchanged invariants:** Existing Gamescope display defaults, SM8550 direct-session/seat ACL behavior, and RK3566 Xwayland host-layer default must remain unchanged.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| RG353M audio topology differs from SM8550 and the wrong Pulse socket is encoded | Treat RG353M socket ownership as an implementation-time characterization step and assert the chosen value in Nix checks. |
| RetroArch omission behavior differs on another device or build | Validate generated config and sink input on-device; only add explicit graph-backend policy after confirming the backend exists. |
| 10% is still loud on some hardware | Keep live validation at 1% and make 10% a named platform value that can later become substrate/device-specific if needed. |
| Steam/FEX audio repair gets overgeneralized without evidence | Limit this plan to explicit audio env wiring and leave generic `pw-link` repair to a reproduced follow-up. |
| Mutable Sobo config diverges from repo defaults | Treat live config edits as deployment-state cleanup after implementation and add repo checks that prevent regenerating the direct ALSA override. |
| Boot audio bootstrap races WirePlumber sink creation | Poll for Pulse readiness and keep checks focused on ordering; if live validation shows sink enumeration lag, deepen bootstrap with sink-specific waiting in the implementation. |

---

## Documentation / Operational Notes

- Update `docs/deployment/korri-images.md` if implementation changes or clarifies the handheld audio boundary: product owns graph-level volume policy and safe boot default; substrate owns hardware facts.
- Record that handhelds intentionally boot at low safe volume rather than preserving a potentially loud prior value.
- Keep live validation procedure conservative: clamp volume first, kill foreground audio producers, then launch one known app at low volume and observe PipeWire sink input before asking a human to listen.

---

## Sources & References

- Related code: `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- Related code: `product/systems/nixos/images/platforms/rocknix-rk3566.nix`
- Related code: `product/services/device/inputd-actions.ts`
- Related code: `product/plugins/retroarch/src/launch-spec.ts`
- Related code: `product/plugins/steam/nix/nixos-module.nix`
- Related checks: `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
- Related checks: `tools/testing/nix/korri-rocknix-rk3566-config-check.nix`
- Institutional learning: `docs/solutions/performance-issues/ryubing-sm8550-turnip26-openal-2026-06-11.md`
- Institutional learning: `docs/solutions/runtime-errors/gamescope-backend-auto-fights-sway-for-drm-master-2026-05-27.md`
- Institutional learning: `docs/solutions/architecture-patterns/architectural-posture-as-nix-image-default-2026-05-27.md`
- Institutional learning: `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md`
