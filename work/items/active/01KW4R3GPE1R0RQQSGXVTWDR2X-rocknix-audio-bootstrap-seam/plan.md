---
title: Refactor RockNIX audio bootstrap seam
type: refactor
status: active
date: 2026-06-27
verify_command: "nix build .#checks.x86_64-linux.korri-rocknix-audio-bootstrap-module .#checks.x86_64-linux.korri-module-identity-audit .#checks.x86_64-linux.korri-sm8550-kiosk-config .#checks.x86_64-linux.korri-rk3566-kiosk-config .#checks.x86_64-linux.korri-standard-native --no-link"
---

# Refactor RockNIX audio bootstrap seam

## Summary

Extract the shared RockNIX audio-bootstrap mechanics into a narrow Korri NixOS module while keeping SM8550 and RK3566 topology facts in their platform adapters. The plan follows the newly extracted RockNIX guest-profile and InputPlumber seams: common mechanics live once, while platform adapters provide topology facts, ordering, failure posture, and constrained platform-specific route scripts.

---

## Problem Frame

SM8550 and RK3566 both poll a PulseAudio-compatible socket, wait for a sink, select it, and clamp boot volume to a safe level, but each platform adapter carries its own shell implementation. That makes future RockNIX devices choose between copy-pasting one chipset's policy or re-learning which parts are product-level audio safety and which parts are hardware topology.

---

## Requirements

- R1. Extract the common RockNIX audio-bootstrap mechanics from platform adapters into a shared Korri-owned seam.
- R2. Preserve SM8550's user-service, best-effort/soft-fail audio behavior so a missing or renamed audio route does not block the visible kiosk session.
- R3. Preserve RK3566's system-service, hard-fail audio behavior so `greetd.service` remains gated on a safe main-space audio clamp.
- R4. Keep device and substrate facts in platform adapters: target sink, Pulse socket address, UCM path, manual PCM route details, service ordering, and extra runtime environment.
- R5. Keep the new module opt-in and RockNIX-specific; non-RockNIX hosts must not inherit service behavior through aggregate Korri modules.
- R6. Replace drift-prone source-text checks with module-option and evaluated-service assertions where possible, while preserving source guards for adapter-specific anti-regression checks that cannot be observed through evaluated config.

---

## Scope Boundaries

- Do not change guest device ACL/seat repair behavior.
- Do not change InputPlumber, inputd, RetroArch, Gamescope, Steam, FEX, or runtime package policy.
- Do not redesign Korri's broader audio route product model, emulator-specific audio backend policy, headphone/speaker switching, or Sobo-specific audio overrides.
- Do not deploy to devices or require live hardware validation as part of this plan.
- Do not change SM8550/RK3566 substrate ownership decisions such as SM8550 user PipeWire service posture or RK3566 main-space PipeWire service dependencies except where references must point at the shared bootstrap service.

### Deferred to Follow-Up Work

- Broader audio policy modeling for emulator backends, dynamic route switching, and Sobo-specific overrides remains separate from this RockNIX bootstrap extraction.

---

## Context & Research

### Relevant Code and Patterns

- `product/systems/nixos/images/platforms/rocknix-sm8550.nix` contains the current SM8550 user-service audio bootstrap, UCM/manual-PCM/fallback route handling, and downstream `korri-compositor` / `korri-sessiond` / `korri-inputd` ordering.
- `product/systems/nixos/images/platforms/rocknix-rk3566.nix` contains the current RK3566 system-service audio bootstrap, main-space Pulse runtime environment, substrate service dependencies, and `greetd.service` gate.
- `product/systems/nixos/modules/korri-rocknix-guest-profile.nix` is the closest extraction precedent: an opt-in RockNIX-specific module where shared mechanics live once and platform-specific labels remain option values.
- `tools/testing/nix/korri-rocknix-guest-profile-module-check.nix` is the check pattern for a host-native `evalConfig` module check.
- `product/systems/nixos/modules/korri-removable-media.nix` shows the opt-in module style for platform-owned appliance behavior that is intentionally not part of the aggregate `korri` module.
- `product/systems/nixos/flake/modules.nix` should register the new module as standalone, not inside `korri`.
- `product/systems/nixos/flake/checks.nix` should register the new module check and add it to the `korri-standard-native` owner matrix.
- `tools/testing/nix/korri-rocknix-sm8550-config-check.nix` and `tools/testing/nix/korri-rocknix-rk3566-config-check.nix` currently verify the platform-specific audio contracts and must migrate with the adapter changes.

### Institutional Learnings

- `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md`: name policy/facts explicitly and have shared composers emit from those fields rather than guessing from incidental runtime state.
- `docs/solutions/architecture-patterns/architectural-posture-as-nix-image-default-2026-05-27.md`: shared modules keep conservative, opt-in defaults; image/platform adapters assert the appliance posture they actually need.
- `docs/solutions/performance-issues/ryubing-sm8550-turnip26-openal-2026-06-11.md`: emulator audio backend policy is a separate layer from PipeWire/Pulse route bootstrap and must not be pulled into this module.

### External References

- External research was skipped. The work is NixOS-module refactoring against strong local patterns, with no new third-party API or framework behavior.

---

## Key Technical Decisions

- Use a shared opt-in NixOS module named `services.korri.rocknixAudioBootstrap`: This mirrors the guest-profile extraction and gives future RockNIX devices one contract for product-owned audio bootstrap mechanics.
- Use one canonical service name, `korri-rocknix-audio-bootstrap`: Varying the service name per chipset would keep ordering and checks drift-prone. Platform adapters should merge their ordering and environment onto the canonical service.
- Keep service ordering in platform adapters: SM8550 and RK3566 order against different systemd namespaces, targets, and substrate units, so the module must not declare `wantedBy`, `after`, `wants`, `requires`, or `before` relationships beyond the service's own one-shot execution shape.
- Keep `PULSE_SERVER` in the module but extra runtime environment in adapters: The module owns the script's Pulse server contract. SM8550's `ALSA_CONFIG_UCM2` and RK3566's `XDG_RUNTIME_DIR`, `DBUS_SESSION_BUS_ADDRESS`, and `PIPEWIRE_RUNTIME_DIR` remain adapter-side facts.
- Model socket failure as an explicit module option and sink failure as caller posture: `failOnSocketUnavailable` can directly decide the socket-check exit code. Named-sink failure should be expressed by a constrained platform route script so RK3566 can call the shared clamp with a hard exit while SM8550 can ignore the return and continue.
- Keep one-consumer fallback behavior in SM8550: the default-sink fallback helper and final `@DEFAULT_SINK@` safety clamp belong in SM8550's route script, not in the shared module body, until another platform consumes that behavior.

---

## Open Questions

### Resolved During Planning

- Should service names stay chipset-specific? Resolved: no; use the canonical shared `korri-rocknix-audio-bootstrap` service name.
- Should sink-unavailable behavior be a generated module option? Resolved: no; adapters express that posture through how they call the shared clamp helper.
- Should the module own platform ordering? Resolved: no; ordering is topology-specific and remains in the adapters.
- Should broader audio route/product behavior be included? Resolved: no; this plan is only the RockNIX bootstrap mechanics seam.

### Deferred to Implementation

- Exact Nix option defaults and assertion wording: implementation should follow the guest-profile module style while preserving the plan's public contract.
- Exact shell diagnostic text: implementation may use the canonical service name or platform context, as long as failure posture and tests cover the observable behavior.
- Whether a tiny private script helper inside the module improves readability: acceptable only if it does not widen the public file surface, expose a second public file, or move platform facts out of adapters.

---

## Implementation Units

### U1. Add shared RockNIX audio-bootstrap module

**Goal:** Create the opt-in module that owns shared Pulse readiness, sink polling, and safe-volume clamp helpers without changing any platform adapter yet.

**Requirements:** R1, R4, R5

**Dependencies:** None

**Files:**
- Create: `product/systems/nixos/modules/korri-rocknix-audio-bootstrap.nix`
- Create: `tools/testing/nix/korri-rocknix-audio-bootstrap-module-check.nix`
- Modify: `product/systems/nixos/flake/modules.nix`
- Modify: `product/systems/nixos/flake/checks.nix`

**Approach:**
- Add a standalone module keyed like existing Korri modules and gated by `services.korri.rocknixAudioBootstrap.enable`.
- Declare explicit options for the platform facts the shared script needs: Pulse server, target sink, safe volume, service scope, socket failure posture, and a constrained adapter-provided `routeBootstrapScript`.
- Emit either a user service or a system service under the canonical name `korri-rocknix-audio-bootstrap` based on service scope.
- The module-created service should set `PULSE_SERVER` from the module option and the one-shot execution shape (`Type=oneshot`, generated script, `RemainAfterExit=true`).
- Do not emit service ordering, substrate dependencies, service user, UCM paths, or runtime-dir environment. Those remain adapter-owned.
- Register the module as a standalone flake module, register a host-native module check, and add the check to the standard-native owner matrix as classification metadata. Keep the explicit module-check build in the verification surface; the owner matrix alone is not a dependency gate.

**Execution note:** Start with the module-evaluation check so the module API and disabled/enabled behavior are characterized before platform adapters move onto it.

**Patterns to follow:**
- `product/systems/nixos/modules/korri-rocknix-guest-profile.nix`
- `tools/testing/nix/korri-rocknix-guest-profile-module-check.nix`
- `product/systems/nixos/modules/korri-removable-media.nix`

**Test scenarios:**
- Happy path: enabling the module with `serviceScope = "user"`, a Pulse server, a target sink, and explicit socket failure posture emits `systemd.user.services.korri-rocknix-audio-bootstrap` and no system service with that name.
- Happy path: enabling the module with `serviceScope = "system"` emits `systemd.services.korri-rocknix-audio-bootstrap` and no user service with that name.
- Happy path: a non-default safe volume value is visible in the generated script so callers can tune the clamp without editing shell.
- Happy path: adapter `routeBootstrapScript` content is included after the shared helper definitions so platform route handling can call the shared functions.
- Edge case: the shared module exposes only the socket gate, named-sink helper, and constrained route script insertion point; SM8550-only default-sink fallback text does not appear in the module fixture.
- Edge case: disabled module emits no audio-bootstrap service in either namespace.
- Error path: enabling the module without a Pulse server or target sink fails evaluation or produces an explicit failed assertion.
- Error path: enabling the module without explicit socket failure posture produces an explicit failed assertion.
- Error path: socket-unavailable posture is reflected in the generated script so soft-fail fixtures exit successfully and hard-fail fixtures exit unsuccessfully at the socket gate.
- Integration: the module check uses a host-native fixture so script text can be inspected without forcing a target-platform build.

**Verification:**
- The new module check passes.
- The module identity audit still passes, proving the new module does not hardcode forbidden runtime-user paths or mutate global audio service options.
- No platform adapter behavior changes in this unit.

---

### U2. Migrate SM8550 to the shared audio-bootstrap service

**Goal:** Replace the SM8550-local bootstrap script and service definition with module options plus SM8550-owned route handling and ordering on the canonical service.

**Requirements:** R1, R2, R4, R6

**Dependencies:** U1

**Files:**
- Modify: `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- Modify: `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`

**Approach:**
- Import/enable the shared module and set SM8550's facts: user service scope, Pulse server, substrate-derived target sink, safe volume posture, and soft socket failure behavior.
- Move the SM8550-specific UCM/manual-PCM/fallback route branches into the module's adapter `routeBootstrapScript` field. Named-sink UCM/manual branches should call shared clamp helpers in non-blocking form, while the SM8550-only default-sink fallback helper and final `@DEFAULT_SINK@` clamp remain in this adapter script so missing or renamed routes cannot fail the visible session.
- Keep SM8550's `ALSA_CONFIG_UCM2` environment and all user-service ordering in the platform adapter by merging onto `systemd.user.services.korri-rocknix-audio-bootstrap`.
- Update downstream service ordering to reference `korri-rocknix-audio-bootstrap.service`.
- Remove the old `korri-sm8550-audio-bootstrap` script derivation and service definition after the shared service is wired.
- Update the SM8550 config check to assert the module options and canonical service wiring instead of checking for the old platform-local script variable.
- Preserve source-level guards that prove the SM8550 adapter does not directly activate hardware UCM cards.

**Execution note:** Treat the adapter migration and check migration as one atomic slice; either side alone leaves the config check red.

**Patterns to follow:**
- Current SM8550 route comments in `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- Existing SM8550 audio assertions in `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
- Guest-profile composed checks that assert module enablement rather than implementation internals

**Test scenarios:**
- Happy path: evaluated SM8550 config has `services.korri.rocknixAudioBootstrap.enable = true`, user service scope, the expected target sink, safe volume, and soft socket-failure posture.
- Happy path: SM8550 route handling keeps named-sink, manual-PCM, and default-sink fallback clamp failures non-blocking so a missing or renamed audio route does not fail the bootstrap service.
- Happy path: the canonical user service has SM8550's PipeWire/WirePlumber ordering, `korri-session.target` enablement, and `ALSA_CONFIG_UCM2` environment.
- Happy path: `korri-compositor`, `korri-sessiond`, and `korri-inputd` order after `korri-rocknix-audio-bootstrap.service`.
- Edge case: the old `korri-sm8550-audio-bootstrap` service name is absent from evaluated downstream ordering so stale names cannot survive alongside the new service.
- Error path: source guard still fails if the SM8550 adapter reintroduces direct hardware UCM activation instead of substrate route graph handling.
- Integration: composed SM8550 check validates the shared module wiring without trying to build or grep target-platform script derivations from the host check.

**Verification:**
- The SM8550 kiosk config check passes with the canonical service name.
- SM8550's visible-session soft-fail audio posture remains encoded in evaluated config and route script ownership.

---

### U3. Migrate RK3566 to the shared audio-bootstrap service

**Goal:** Replace the RK3566-local bootstrap script and service definition with module options plus RK3566-owned main-space runtime environment and `greetd` gate on the canonical service.

**Requirements:** R1, R3, R4, R6

**Dependencies:** U1

**Files:**
- Modify: `product/systems/nixos/images/platforms/rocknix-rk3566.nix`
- Modify: `tools/testing/nix/korri-rocknix-rk3566-config-check.nix`

**Approach:**
- Import/enable the shared module and set RK3566's facts: system service scope, main-space Pulse server, substrate default sink, safe volume, and hard socket-failure posture.
- Use adapter `routeBootstrapScript` to call the shared named-sink clamp with explicit hard-fail behavior so sink timeout still blocks `greetd`.
- Keep RK3566's main-space runtime environment, substrate service dependencies, root service user posture, and `greetd` `requires`/`after` wiring in the platform adapter by merging onto `systemd.services.korri-rocknix-audio-bootstrap`.
- Remove the old `korri-rk3566-audio-bootstrap` script derivation and service definition after the canonical service is wired.
- Update the RK3566 config check to assert module options and canonical service wiring instead of grepping platform-local safe-volume shell.

**Execution note:** Treat the adapter migration and check migration as one atomic slice; the existing source-text assertions become stale as soon as the platform-local script is removed.

**Patterns to follow:**
- Current RK3566 main-space audio ordering in `product/systems/nixos/images/platforms/rocknix-rk3566.nix`
- Existing RK3566 audio assertions in `tools/testing/nix/korri-rocknix-rk3566-config-check.nix`

**Test scenarios:**
- Happy path: evaluated RK3566 config has `services.korri.rocknixAudioBootstrap.enable = true`, system service scope, target sink equal to the substrate default sink, safe volume, and hard socket-failure posture.
- Happy path: the canonical system service retains all required main-space `after`, `wants`, and `requires` relationships, including the substrate audio sink bootstrap dependency.
- Happy path: the canonical system service retains RK3566's root/main-space runtime environment needed for `pactl` to reach the intended graph.
- Happy path: `greetd.service` requires and orders after `korri-rocknix-audio-bootstrap.service`.
- Edge case: the old `korri-rk3566-audio-bootstrap` service name is absent from `greetd` dependencies.
- Error path: hard-fail sink clamp posture remains represented in the adapter-provided script path so a missing target sink still prevents login from proceeding.
- Integration: composed RK3566 check validates canonical service wiring without pulling SM8550-only UCM/fallback behavior into RK3566.

**Verification:**
- The RK3566 kiosk config check passes with the canonical service name.
- RK3566 still gates `greetd` on successful main-space audio clamping.

---

## System-Wide Impact

- **Interaction graph:** Platform adapters still own when audio bootstrap runs relative to PipeWire/WirePlumber, `greetd`, and Korri runtime services. The shared module only provides the canonical service and script mechanics.
- **Error propagation:** SM8550 keeps best-effort audio startup; RK3566 keeps hard-gated login startup. The module must not collapse these into one default behavior.
- **State lifecycle risks:** The bootstrap remains one-shot and idempotent at boot; it should not introduce persistent audio state or modify substrate audio services.
- **API surface parity:** The public NixOS option surface is the new cross-device contract. Future RockNIX devices should opt into it instead of copying SM8550/RK3566 scripts.
- **Integration coverage:** Module checks cover shared script mechanics; composed platform checks cover service topology and adapter facts. `korri-standard-native` owner-matrix registration classifies the new check, while the explicit verify command builds it.
- **Unchanged invariants:** No non-RockNIX aggregate behavior changes; no change to emulator audio backend policy; no change to InputPlumber/inputd/Gamescope paths.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Service-name migration drops an ordering edge | Use one canonical service name and update platform adapters plus checks atomically in U2/U3. |
| RK3566 hard-fail posture becomes soft-fail because shell return values are ignored | Express hard-fail posture in RK3566 adapter `routeBootstrapScript` by explicitly exiting on failed clamp, and assert it in the RK3566 config/module checks. |
| SM8550 soft-fail posture narrows to socket failures only | Require SM8550 route script handling to keep named-sink, manual-PCM, and default-sink fallback clamp failures non-blocking. |
| New module trips module identity audit by hardcoding runtime user paths or mutating global audio services | Keep runtime paths and extra environment in platform adapters; verify with `korri-module-identity-audit`. |
| SM8550 UCM/manual-PCM route details become over-generalized | Keep route-specific shell fragments in SM8550 adapter `routeBootstrapScript`; the module only supplies helper mechanics. |
| Platform config checks force target-platform script builds | Inspect generated script text only in the host-native module check; composed platform checks should inspect options and evaluated service attributes. |
| Parallel or unpushed platform-adapter work causes rebase conflicts | Start implementation from current local `trunk` and keep U2/U3 atomic; resolve conflicts before broadening scope. |

---

## Documentation / Operational Notes

- No user-facing docs are required for this refactor.
- The plan intentionally creates a reusable NixOS option seam; implementation should prefer clear option descriptions because that option namespace becomes the durable documentation for future RockNIX platforms.
- Live device validation is useful after implementation but is not a completion gate for this planning scope.

---

## Sources & References

- Related code: `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- Related code: `product/systems/nixos/images/platforms/rocknix-rk3566.nix`
- Related code: `product/systems/nixos/modules/korri-rocknix-guest-profile.nix`
- Related code: `product/systems/nixos/modules/korri-removable-media.nix`
- Related checks: `tools/testing/nix/korri-rocknix-guest-profile-module-check.nix`
- Related checks: `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
- Related checks: `tools/testing/nix/korri-rocknix-rk3566-config-check.nix`
- Institutional learning: `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md`
- Institutional learning: `docs/solutions/architecture-patterns/architectural-posture-as-nix-image-default-2026-05-27.md`
- Institutional learning: `docs/solutions/performance-issues/ryubing-sm8550-turnip26-openal-2026-06-11.md`
