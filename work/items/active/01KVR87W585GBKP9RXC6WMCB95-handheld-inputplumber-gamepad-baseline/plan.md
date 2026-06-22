---
title: feat: Standardize handheld InputPlumber gamepad baseline
type: feat
status: active
date: 2026-06-22
verify_command: "nix build .#checks.x86_64-linux.korri-sm8550-kiosk-config .#checks.x86_64-linux.korri-rk3566-kiosk-config --no-link && bun test product/platform/input/native/inputplumber-virtual-gamepad.test.ts product/services/device/inputd.test.ts product/plugins/retroarch/src/launch-spec.test.ts"
---

# feat: Standardize handheld InputPlumber gamepad baseline

## Summary

Standardize Korri handhelds around one product controller contract: physical handheld controls are claimed by InputPlumber, raw controller nodes are hidden from app consumers, and games see a stable Xbox 360/XInput-style virtual gamepad. The plan turns the Sobo/Bandai working pattern into shared platform posture for SM8550 and RK3566/RG353M, adds checks that catch bring-up drift, and makes RetroArch consume the normalized virtual controller through `udev`/autodetect instead of per-device button maps.

---

## Problem Frame

Live RG353M validation showed the Korri GUI works through `korri-inputd`, but RetroArch on `.140` does not inherit Sobo's controller baseline. `.140` exposes an InputPlumber virtual controller as `Microsoft Xbox Series S|X Controller` on `/dev/input/event7` and still leaks the raw built-in `retrogame_joypad` on `/dev/input/js0`. Generated RetroArch configs on `.140` are minimal and omit input driver/autodetect/player settings, while Sobo-generated RetroArch configs include `udev`, `input_autodetect_enable`, `input_player1_joypad_index`, and explicit Xbox-style binds.

The durable fix should not be another `.140`-only RetroArch mapping. The product contract is that InputPlumber is the hardware abstraction boundary: platform profiles own physical-device maps, virtual target selection, raw-source isolation, and device ACL quirks; app launchers and product code consume only the app-facing virtual gamepad.

---

## Requirements

- R1. Sobo/Bandai-class SM8550 devices and RG353M/RK3566 must declare InputPlumber as the normalized handheld gamepad provider.
- R2. The app-facing controller identity must converge on a stable Xbox 360/XInput-style target where possible, rather than mixing Xbox Series and Xbox 360 target identities across handhelds.
- R3. Claimed raw physical gamepad devices must not remain visible to foreground apps when InputPlumber has produced the normalized virtual controller.
- R4. `korri-inputd` must continue to fail closed for gamepads: use the InputPlumber virtual controller when present, and do not fall back to raw handheld controls.
- R5. RetroArch launch policy for handhelds must use `udev`/autodetect/player-index defaults that consume the normalized controller, without hard-coding per-device physical button maps.
- R6. Platform defaults must avoid `apps.retroarch` collisions in the readable config graph; RetroArch behavior should be expressed through launcher/policy fields or plugin defaults that compose with user config.
- R7. Nix/config checks must prove the baseline for SM8550 and RK3566 at evaluation time, including virtual target policy, InputPlumber data path, raw-source isolation posture, inputd ordering, and RetroArch policy defaults.
- R8. The implementation must preserve existing display/session/audio behavior on both platform adapters; controller work must not regress the SM8550 user-session shape or RK3566 Gamescope Xwayland posture.
- R9. Live validation must prove a RetroArch title on RG353M accepts physical controls through the virtual controller and that raw controls no longer win enumeration.

---

## Scope Boundaries

- Do not re-add Switch, Neverball, or Mega Man Arena to `.140`; those catalog choices are outside this input baseline.
- Do not solve missing runtimes such as `gauntlet-iii-zxspectrum` or `to-the-top` launch failures.
- Do not introduce per-device product-code controller profiles named after Sobo, Odin, Bandai, RG353M, or `retrogame_joypad`.
- Do not rename the broader input architecture to `normalizedGamepad` or `standardController`; if a product option is needed, prefer a neutral shape under `services.korri.input.gamepad`.
- Do not redesign spatial navigation, React input APIs, or the `korri-inputd` WebSocket protocol beyond the minimum needed for provider hints/checks.
- Do not make Steam Input or Moonlight runtime-resolution validation part of the first success gate, except where existing SM8550 checks already cover InputPlumber/uinput invariants.
- Do not manually edit live `.140` generated RetroArch config as the durable fix; generated config must come from source-controlled policy.

### Deferred to Follow-Up Work

- Multi-controller player assignment and multiplayer policy beyond the single built-in handheld controller.
- User-facing controller diagnostics/settings UI.
- Upstreaming corrected InputPlumber device maps to nix-on-rocks/InputPlumber after the local Korri contract is proven.
- Reworking `services.korri.input.provider` naming if a future non-InputPlumber provider appears; this plan keeps the current provider seam.

---

## Context & Research

### Relevant Code and Patterns

- `product/systems/nixos/modules/korri-input.nix` is the shared input module. It enables `services.inputplumber`, loads `uinput`, writes `/dev/uinput` udev rules, and orders `korri-inputd` after `inputplumber.service` when `services.korri.input.provider.name = "inputplumber"`.
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix` already has the richest handheld baseline: patched InputPlumber package, evdev ACL rule for the Korri user, DRM/input/tty trigger/fallback services, and SM8550 platform checks.
- `product/systems/nixos/images/platforms/rocknix-rk3566.nix` currently enables InputPlumber but uses the substrate package as-is and lacks SM8550's raw-device/ACL hardening and RetroArch input policy posture.
- `product/platform/input/native/inputplumber-virtual-gamepad.ts` already resolves InputPlumber virtual controllers and rejects raw-only topologies; tests cover Xbox 360, Xbox Series, raw-only, ambiguous, and renumbered fixtures.
- `product/services/device/inputd.ts` already filters discovered gamepads to the resolved InputPlumber virtual device and returns only non-gamepads when resolution is missing or ambiguous.
- `product/plugins/retroarch/src/launch-spec.ts` can render `drivers.input`, `drivers.joypad`, `input.autodetect`, `input.maxUsers`, and per-port joypad settings; Sobo's live working config is expressible through this policy shape.
- `product/systems/nixos/images/platforms/rocknix-rk3566.nix` explicitly warns not to define `apps.retroarch` in platform defaults because user-authored app records would collide in ProseQL; that constraint should remain.
- `tools/testing/nix/korri-rocknix-sm8550-config-check.nix` is the reference for platform posture assertions. `tools/testing/nix/korri-rocknix-rk3566-config-check.nix` is much smaller and should gain input assertions.

### Institutional Learnings

- `docs/handoffs/bandai-inputplumber-xb360-controller-normalization-2026-06-09.md`: Bandai emitted `Microsoft Xbox Series S|X Controller`; a Moonlight mapping overlay helped, but the permanent product fix is making InputPlumber emit the intended Xbox 360 virtual target so all consumers see one normalized controller contract.
- `docs/solutions/integration-issues/steam-uinput-permissions-block-virtual-xinput-2026-06-13.md`: InputPlumber normalization and `/dev/uinput` permission are separate gates. The baseline must verify both when relevant rather than treating service liveness as proof.
- `docs/solutions/architecture-patterns/architectural-posture-as-nix-image-default-2026-05-27.md`: always-on device posture belongs in platform/image defaults plus eval checks, not hidden in generic module defaults that new device profiles can forget.
- `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md`: app/runtime behavior should be named policy in the cascade, not argv/env sniffing. RetroArch input behavior should be explicit policy.
- `docs/solutions/runtime-errors/retroarch-bare-passthru-wrapper-injects-l-coredir-2026-05-27.md`: keep using Korri's explicit-core RetroArch packaging/launch path; do not fix input by switching to nixpkgs wrapper behavior that injects its own `-L`.

### External References

External research was skipped. The repo already has local InputPlumber, `inputd`, RetroArch policy, and RockNIX platform patterns specific to this architecture.

---

## Assumptions

- The desired long-term app-facing controller target is Xbox 360/XInput-style. Xbox Series output is acceptable only as a documented temporary compatibility window if forcing Xbox 360 on RG353M blocks restoring controls.
- InputPlumber is installed on the relevant handhelds and should be the sole physical-controller abstraction for game/app consumers.
- The live `.140` observation that raw `retrogame_joypad` remains visible is a product bug in platform isolation, not a reason to teach RetroArch about `retrogame_joypad`.
- Raw-source isolation must cover both raw `event*` and raw `js*` gamepad paths; `.140` already leaked `/dev/input/js0`.
- Sobo's explicit RetroArch bindings are useful as characterization evidence, but the preferred durable architecture is `udev` autodetect against a standard virtual target.

---

## Key Technical Decisions

- Use `services.korri.input.provider` as the existing provider seam first. Add `services.korri.input.gamepad` only if implementation proves it needs a durable option for target identity, raw-source policy, or resolver preferences. If named, prefer `services.korri.input.gamepad` rather than `normalizedGamepad` or `standardController`.
- Converge virtual target identity in platform packaging, not in app launchers. SM8550's patched `inputplumberPackage` is the current precedent; RK3566 needs an equivalent evaluated posture or a documented temporary Xbox Series compatibility window while Xbox 360 remains the target contract.
- Keep `inputd` virtual-only gamepad filtering. Product UI can continue receiving non-gamepad system controls, but gamepads must come from the InputPlumber virtual device.
- Express RetroArch input defaults as policy rendered by `product/plugins/retroarch/src/launch-spec.ts`, not as hand-written per-device `retroarch.cfg` files. Try `udev` autodetect first and add explicit binds only after live validation proves they are needed.
- Prefer platform/plugin defaults over app records for RetroArch on RK3566. This preserves the existing no-`apps.retroarch` invariant and avoids config graph collisions.
- Treat raw-source hiding and virtual-target emission as separate validation gates. A system can have the right virtual controller and still be wrong if raw `js*`/`event*` gamepads remain app-visible.
- Add eval checks before relying on more manual bring-up memory. The failure mode is device drift: Sobo had the baseline, `.140` did not.

---

## Open Questions

### Resolved During Planning

- Should the baseline apply only to `.140`? No. The target is common handheld behavior across Sobo, `.140`, and Bandai-like devices.
- Should apps consume raw built-in controller devices when InputPlumber is present? No. Raw physical devices should be hidden or made non-winning for foreground apps.
- Should the durable fix be RetroArch-specific button maps for RG353M? No. RetroArch should consume a standard virtual controller via `udev`/autodetect; explicit binds are a fallback characterization path.
- Should the option be called `normalizedGamepad` or `standardController`? No. If new product-level configuration is needed, use a neutral hierarchy such as `services.korri.input.gamepad`.
- Should the first implementation hide raw `event*` only or raw `event*` and `js*` gamepad nodes? Hide both; `.140` already leaked `/dev/input/js0`, and apps can enumerate either surface.
- If RG353M cannot immediately emit Xbox 360, should Xbox Series block the fix? No. Xbox Series is acceptable as a temporary documented compatibility window, but Xbox 360 remains the target contract.
- Should RetroArch start with explicit button binds? No. Start with `udev` autodetect, then add binds only after live validation proves the virtual controller is not mapped correctly.
- What is the minimum `.140` live success gate? Generated RetroArch config has the input baseline, raw gamepad does not win app enumeration, Sonic Advance responds to physical controls, and stopping returns Korri home.

### Deferred to Implementation

- Exact InputPlumber profile file(s) that need patching on RK3566/RG353M; implementation should inspect the active substrate package and map names before editing.
- Exact raw-source isolation mechanism for RK3566: udev `OPTIONS+="link_priority"`, moving source nodes under `/dev/inputplumber/sources/`, ACL/group removal, or InputPlumber-native source handling may be appropriate depending on substrate behavior.
- Whether RetroArch requires explicit `input_player1_*_btn` binds after the virtual target is Xbox-style. Start with autodetect/player-index policy and add binds only if live validation proves the autoconfig database is insufficient.
- Exact validation method for proving raw `js*` and raw `event*` gamepad paths no longer win app enumeration after isolation is applied.

---

## Implementation Units

### U1. Define the handheld gamepad posture in the shared input module

**Goal:** Give platform adapters a source-controlled way to declare the desired gamepad target identity and raw-source isolation posture without scattering ad-hoc booleans across SM8550 and RK3566 files.

**Requirements:** R1, R2, R3, R7, R8

**Dependencies:** None

**Files:**
- Modify: `product/systems/nixos/modules/korri-input.nix`
- Test: `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
- Test: `tools/testing/nix/korri-rocknix-rk3566-config-check.nix`

**Approach:**
- Keep `services.korri.input.provider` as the generic provider declaration and first implementation seam.
- Add a small `services.korri.input.gamepad` subtree only if implementation proves a durable named posture is needed. Candidate fields: `enable`, `target = "xb360"`, `hideClaimedSources = true`, and optional `preferredVirtualNames`/`preferredEventNodes` for ambiguous runtime topologies.
- Make defaults conservative in the module and assert always-on handheld posture in platform adapters with `lib.mkDefault`, following the image-default learning.
- Do not put SM8550/RK3566 hardware names in the shared module. The module should describe the contract; platform adapters/package overlays supply hardware facts.
- If no new options are necessary, document this unit as strengthening comments/assertions around the existing provider seam rather than adding configuration surface area.

**Execution note:** Characterization-first. Add failing or expanded Nix assertions for the desired posture before broadening module behavior.

**Patterns to follow:**
- `product/systems/nixos/modules/korri-input.nix` provider/inputd split.
- `product/systems/nixos/modules/korri-daemon.nix` assertion style for streaming requiring normalized input.
- `tools/testing/nix/korri-rocknix-sm8550-config-check.nix` `check = message: assertion:` pattern.

**Test scenarios:**
- Happy path: SM8550 and RK3566 evaluated configs both declare InputPlumber as the provider and handheld gamepad posture as enabled.
- Happy path: target identity policy evaluates to Xbox 360/XInput-style for handheld platforms.
- Edge case: enabling gamepad posture without `provider.name = "inputplumber"` fails with a clear assertion or remains impossible by construction.
- Regression: generic non-handheld module defaults do not accidentally force a RockNIX-specific target or raw-source policy.

**Verification:**
- `nix build .#checks.x86_64-linux.korri-sm8550-kiosk-config .#checks.x86_64-linux.korri-rk3566-kiosk-config --no-link` proves the shared posture is visible to both platform checks.

---

### U2. Converge InputPlumber virtual target packaging on Xbox 360

**Goal:** Make SM8550 and RK3566 emit the same stable app-facing virtual controller identity where possible, replacing the current mixed Xbox Series/Xbox 360 behavior.

**Requirements:** R2, R4, R7, R8

**Dependencies:** U1 for posture naming/check shape.

**Files:**
- Modify: `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- Modify: `product/systems/nixos/images/platforms/rocknix-rk3566.nix`
- Modify as needed: `product/systems/nixos/modules/korri-input.nix`
- Test: `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
- Test: `tools/testing/nix/korri-rocknix-rk3566-config-check.nix`

**Approach:**
- Inspect the current SM8550 patch (`02-ayn-controller.yaml` substituting `xbox-series` to `xb360`) and make the check prove the active package contains the intended target and not the undesired target for relevant device profiles.
- Add an RK3566 package overlay or shared helper if the substrate package emits Xbox Series or another non-canonical target for RG353M.
- If RG353M cannot immediately emit Xbox 360 without delaying the control fix, allow Xbox Series only as a documented temporary compatibility window and keep a follow-up path to Xbox 360.
- Prefer a reusable package transformation function if both platform adapters need the same substitution, but do not over-abstract before confirming the profile files differ.
- Keep the resolver tolerant of both Xbox 360 and Xbox Series during rollout; the target convergence happens in platform packaging, not by narrowing runtime discovery too early.

**Patterns to follow:**
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix` `inputplumberPackage = pkgs.runCommand "korri-rocknix-inputplumber-xb360"`.
- `docs/handoffs/bandai-inputplumber-xb360-controller-normalization-2026-06-09.md` permanent fix recommendation.

**Test scenarios:**
- Happy path: evaluated SM8550 InputPlumber package/profile contains the `xb360` target for the handheld controller profile.
- Happy path: evaluated RK3566 InputPlumber package/profile contains the canonical target or an explicit temporary Xbox Series compatibility exception with Xbox 360 still documented as the target contract.
- Error path: a package/profile still containing only `xbox-series` for a handheld gamepad fails the platform config check unless it is explicitly marked as a temporary RG353M compatibility exception.
- Regression: InputPlumber `XDG_DATA_DIRS` still starts with `/run/current-system/sw/share:` so product maps can shadow package defaults.
- Regression: `korri-inputd` tests still resolve both target names while deployed platforms migrate.

**Verification:**
- Nix checks prove package/profile target selection for SM8550 and RK3566.
- `bun test product/platform/input/native/inputplumber-virtual-gamepad.test.ts` still passes during the compatibility window.

---

### U3. Centralize raw physical gamepad isolation for RockNIX guests

**Goal:** Prevent apps from seeing claimed physical controller devices ahead of the InputPlumber virtual controller, with explicit coverage for both `event*` and `js*` leakage observed on `.140`.

**Requirements:** R3, R4, R7, R8, R9

**Dependencies:** U1 and U2, because isolation is only correct once InputPlumber is the declared provider and virtual target is expected.

**Files:**
- Modify: `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- Modify: `product/systems/nixos/images/platforms/rocknix-rk3566.nix`
- Modify as needed: `product/systems/nixos/modules/korri-input.nix`
- Test: `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
- Test: `tools/testing/nix/korri-rocknix-rk3566-config-check.nix`

**Approach:**
- Treat SM8550's current evdev ACL and DRM/input/tty trigger/fallback as the reference for host-bound device nodes, but do not blindly copy rootless-user assumptions into RK3566.
- Add RK3566 checks and platform logic for raw source device hiding. The first implementation must cover both raw `event*` and raw `js*` gamepad paths because apps can enumerate either surface.
- Include `/dev/input/js*` in the design because `.140` specifically leaked `retrogame_joypad` as `/dev/input/js0`.
- Ensure `korri-inputd` still has access to the normalized virtual event node and any non-gamepad controls it legitimately handles.
- Keep rules idempotent and boot-safe for nspawn/host-bound device nodes that may not emit fresh guest `add` events.

**Patterns to follow:**
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix` `korriRocknixSeatDeviceSetup`, `korri-rocknix-seat-device-trigger`, and `korri-rocknix-device-acl-fallback`.
- `product/systems/nixos/modules/korri-input.nix` uinput udev rule ownership.
- `docs/solutions/integration-issues/steam-uinput-permissions-block-virtual-xinput-2026-06-13.md` separation of normalization vs permission gates.

**Test scenarios:**
- Happy path: SM8550 checks continue to prove event nodes are readable by `korri-inputd` and seat/device fallback services exist.
- Happy path: RK3566 checks prove an explicit raw-source isolation rule/service exists for gamepad `event*` and `js*` nodes.
- Edge case: non-gamepad system controls needed by inputd are not hidden by broad gamepad rules.
- Edge case: host-bound nodes present before guest udev starts are reprocessed or handled by fallback logic.
- Regression: `/dev/uinput` remains `root:input 0660` for InputPlumber/Sunshine paths and is not confused with raw-source hiding.

**Verification:**
- Nix checks cover both SM8550 and RK3566 raw-source isolation posture.
- Live RG353M validation shows no app-visible raw `retrogame_joypad` `js*` node wins enumeration while the InputPlumber virtual controller is present.

---

### U4. Add handheld RetroArch input policy defaults

**Goal:** Make generated RetroArch configs on handhelds consume the normalized virtual controller through `udev`/autodetect/player-index defaults, replacing `.140`'s current minimal config gap.

**Requirements:** R5, R6, R7, R8, R9

**Dependencies:** U2 for target identity and U3 for raw-source isolation.

**Files:**
- Modify: `product/plugins/retroarch/src/policy.ts`
- Modify: `product/plugins/retroarch/src/launch-spec.ts`
- Modify: `product/plugins/retroarch/src/launch-spec.test.ts`
- Modify as needed: `product/plugins/retroarch/src/plugin.ts`
- Modify: `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- Modify: `product/systems/nixos/images/platforms/rocknix-rk3566.nix`
- Test: `product/plugins/retroarch/src/launch-spec.test.ts`
- Test: `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
- Test: `tools/testing/nix/korri-rocknix-rk3566-config-check.nix`

**Approach:**
- Define a reusable RetroArch input baseline policy equivalent to the validated Sobo essentials: `drivers.input = "udev"`, `drivers.joypad = "udev"`, `input.autodetect = true`, `input.maxUsers = 4`, `input.ports["1"].joypadIndex = 0`, and `input.ports["1"].analogDpadMode = 1` if still needed.
- Keep explicit `input_player1_*_btn` binds out of the first implementation unless live validation proves RetroArch's autoconfig database cannot map the Xbox-style virtual target.
- Apply the policy through platform defaults/launcher settings that compose with the readable config graph. Do not add an `apps.retroarch` record in RK3566 platform defaults.
- Preserve existing safe lifecycle settings (`config_save_on_exit = false`, no auto overrides/remaps/shaders) and audio/display decisions from adjacent plans.
- Add unit tests that render the exact baseline keys so future minimal configs cannot regress silently.

**Patterns to follow:**
- `product/plugins/retroarch/src/launch-spec.ts` `appendDriverSettings` and input port rendering.
- `product/plugins/retroarch/src/launch-spec.test.ts` typed setting rendering assertions.
- `product/systems/nixos/images/platforms/rocknix-rk3566.nix` host Gamescope platform-default style and no-`apps.retroarch` check.

**Test scenarios:**
- Happy path: rendering the handheld RetroArch baseline includes `input_driver = "udev"`, `input_joypad_driver = "udev"`, `input_autodetect_enable = "true"`, and `input_player1_joypad_index = 0`.
- Happy path: lifecycle safety defaults still render alongside input defaults.
- Edge case: user/platform-specific explicit button binds remain possible through policy, but are absent from the generic handheld baseline.
- Regression: RK3566 rendered platform defaults still do not define an `apps.retroarch` record.
- Regression: existing audio omission semantics from the handheld audio plan are unchanged.

**Verification:**
- `bun test product/plugins/retroarch/src/launch-spec.test.ts` proves the generated config shape.
- Nix checks prove platform defaults carry the RetroArch input baseline without app-record collisions.

---

### U5. Thread optional virtual-gamepad preferences into `inputd` only if needed

**Goal:** Let platform posture disambiguate unusual topologies without weakening the default fail-closed resolver behavior.

**Requirements:** R4, R7, R8

**Dependencies:** U1 and U2.

**Files:**
- Modify as needed: `product/services/device/inputd.ts`
- Modify as needed: `product/services/device/inputd.test.ts`
- Modify as needed: `product/systems/nixos/modules/korri-input.nix`
- Test: `product/services/device/inputd.test.ts`
- Test: `product/platform/input/native/inputplumber-virtual-gamepad.test.ts`

**Approach:**
- Keep the current no-preference path for normal single-controller handhelds.
- If a real platform exposes multiple InputPlumber virtual gamepads, wire environment-backed preferences from `services.korri.input.gamepad` into `resolveInputPlumberVirtualGamepad`.
- Preferences must narrow the candidate set and still fail closed if missing or ambiguous; do not introduce "first candidate wins" behavior.
- Log enough structured detail for device bring-up without exposing raw-device fallback.

**Patterns to follow:**
- `product/platform/input/native/inputplumber-virtual-gamepad.ts` `preferredNames` and `preferredEventNodes` behavior.
- `product/services/device/inputd.ts` warning path for missing/ambiguous normalized gamepad.

**Test scenarios:**
- Happy path: inputd selects a preferred virtual controller when the resolver has two candidates and a valid preference.
- Error path: missing preference produces no gamepad rather than raw fallback.
- Error path: preference matching multiple candidates remains ambiguous.
- Regression: no-preference single-controller fixture still selects the virtual controller.

**Verification:**
- `bun test product/services/device/inputd.test.ts product/platform/input/native/inputplumber-virtual-gamepad.test.ts` proves fail-closed selection and preference behavior.

---

### U6. Add live RG353M validation gates and deployment notes

**Goal:** Prove the source-controlled baseline fixes the original `.140` RetroArch controller failure and leaves the game library/session flow healthy.

**Requirements:** R3, R5, R8, R9

**Dependencies:** U2, U3, U4.

**Files:**
- Modify as needed: `tools/device/steam` or existing device scripts only if a reusable read-only probe belongs there.
- No required source changes if validation remains manual for this slice.

**Approach:**
- Deploy the evaluated RK3566/RG353M config to the `.140` class device using the normal device workflow for that platform.
- Re-run read-only device probes before launching: `cat /proc/bus/input/devices`, `ls -l /dev/input`, and generated RetroArch config inspection from a dry-run launch artifact.
- Launch a RetroArch GBA title such as `sonic-advance` and verify physical D-pad/buttons affect the game.
- Verify session recovery after stopping the game (`sessiond` returns to home) so the input fix does not destabilize foreground lifecycle.
- Capture discrepancies as follow-up backlog items rather than widening this plan into unrelated runtime fixes.

**Patterns to follow:**
- Existing `korrid_dry_run_launch`, `korrid_launch_game`, and `korrid_stop_session` workflows used during `.140` setup.
- Existing manual SSH known-host pattern documented in the compacted session for `.140`.

**Test scenarios:**
- Happy path: dry-run generated RetroArch config includes the handheld input baseline keys.
- Happy path: `/proc/bus/input/devices` shows the InputPlumber virtual Xbox 360/XInput-style controller, or a documented temporary Xbox Series compatibility target, and does not leave raw built-in gamepad as the app-selected input.
- Happy path: launched Sonic Advance in RetroArch responds to physical controls.
- Regression: Korri GUI controls still work through `korri-inputd` after raw-source hiding.
- Regression: stopping the game returns `sessiond` to `mode: home`.

**Verification:**
- Live RG353M notes show the generated config, input device inventory, and successful RetroArch control behavior.
- Any remaining non-RetroArch launch failures are parked separately.

---

## Sequencing

1. U1 first: establish the product-level posture and eval-check language so implementation has a target.
2. U2 next: converge virtual target identity; this avoids chasing RetroArch binds for the wrong device shape.
3. U3 next: hide raw sources so foreground apps cannot bypass the virtual target.
4. U4 next: generate the RetroArch `udev`/autodetect baseline now that the underlying controller contract is stable.
5. U5 only if live/eval topology needs resolver preferences; otherwise keep it deferred.
6. U6 last: deploy and validate on RG353M/.140, then decide whether any explicit RetroArch binds are necessary.

---

## Risk and Mitigation

- **Risk:** Changing InputPlumber target identity can break an existing consumer that currently recognizes Xbox Series. **Mitigation:** keep the TypeScript resolver tolerant during rollout and validate `inputd`, RetroArch, and any Moonlight smoke path before removing compatibility.
- **Risk:** Raw-source hiding could hide power/volume/system controls needed by `inputd`. **Mitigation:** scope rules to claimed gamepad source devices and include live checks for GUI shortcuts after deployment.
- **Risk:** RetroArch autoconfig may not map the virtual target correctly on RK3566. **Mitigation:** start with standard Xbox 360 target plus `udev` autodetect; only add explicit binds after a reproduced autoconfig miss.
- **Risk:** RK3566 currently runs more of the stack as root than SM8550, so copying SM8550 ACL assumptions may be misleading. **Mitigation:** encode RK3566-specific topology in its platform adapter and checks rather than blindly sharing services.
- **Risk:** Nix eval can prove config shape but not actual host-bound device behavior. **Mitigation:** include U6 live validation against `.140` as a required release gate.

---

## Verification Matrix

- Unit: `bun test product/platform/input/native/inputplumber-virtual-gamepad.test.ts` for virtual target resolution and raw fallback rejection.
- Unit: `bun test product/services/device/inputd.test.ts` for inputd filtering/preferences if changed.
- Unit: `bun test product/plugins/retroarch/src/launch-spec.test.ts` for generated input baseline keys.
- Eval: `nix build .#checks.x86_64-linux.korri-sm8550-kiosk-config --no-link` for SM8550 posture.
- Eval: `nix build .#checks.x86_64-linux.korri-rk3566-kiosk-config --no-link` for RG353M/RK3566 posture.
- Live: RG353M/.140 dry-run generated RetroArch config includes `udev`/autodetect/player-index keys.
- Live: RG353M/.140 raw `event*` and `js*` gamepad devices do not win app enumeration while the InputPlumber virtual controller is present.
- Live: RG353M/.140 Sonic Advance in RetroArch responds to physical controls and returns to home after stop.

---

## Handoff Notes for Implementation

- Start by reading `product/systems/nixos/modules/korri-input.nix`, `product/systems/nixos/images/platforms/rocknix-sm8550.nix`, `product/systems/nixos/images/platforms/rocknix-rk3566.nix`, `product/platform/input/native/inputplumber-virtual-gamepad.ts`, and `product/plugins/retroarch/src/launch-spec.ts`.
- Use Sobo's live RetroArch config as characterization evidence, not as a template to copy wholesale.
- Prefer checks that fail at eval time over manual deployment memory.
- Keep unrelated catalog/library fixes out of this slice.
