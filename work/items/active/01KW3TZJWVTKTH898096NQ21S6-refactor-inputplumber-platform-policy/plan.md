---
title: refactor: Deepen InputPlumber platform policy seams
type: refactor
status: active
date: 2026-06-27
verify_command: "nix build .#checks.x86_64-linux.korri-input-module .#checks.x86_64-linux.korri-inputplumber-xb360-helper .#checks.x86_64-linux.korri-rk3566-kiosk-config .#checks.x86_64-linux.korri-sm8550-kiosk-config .#checks.x86_64-linux.korri-live-usb-config --no-link"
---

# refactor: Deepen InputPlumber platform policy seams

## Summary

Move the remaining obvious InputPlumber/RetroArch platform drift into shared Korri-owned seams. The plan keeps the slice intentionally small: finish the RK3566 RetroArch follow-through, add a reusable InputPlumber data-path option, and extract the duplicated RockNIX xb360 map patch helper without taking on broader inputd, audio, Gamescope, or runtime-profile refactors.

---

## Problem Frame

The RetroArch/InputPlumber autoconfig fix moved SM8550 controller policy out of a device adapter and into the RetroArch plugin module. The deep scan found the same pattern still present in nearby RockNIX platform code: RK3566 still carries a local RetroArch input baseline, platform adapters hand-build InputPlumber data discovery, and two adapters duplicate the xb360 map patching logic.

This cleanup exists to prevent the next device from copying those fragments again.

---

## Requirements

- R1. RK3566 must inherit RetroArch's InputPlumber autoconfig baseline from the shared RetroArch plugin module, including `joypad_autoconfig_dir`, rather than defining its own handheld policy.
- R2. RockNIX InputPlumber xb360 map patching must have one shared helper for the repeated patch-and-verify behavior, while preserving each platform's physical YAML file and package shape.
- R3. InputPlumber service data discovery must be expressible through a shared `services.korri.input` option so platform adapters declare extra data packages instead of constructing `XDG_DATA_DIRS` by hand.
- R4. SM8550, RK3566, and x86 existing behavior must not regress; platform-specific facts and deliberate override ordering remain where they are still needed.
- R5. The cleanup must be covered by Nix module/config checks at the shared seam and at the affected composed-platform outputs.

---

## Scope Boundaries

- Do not refactor `inputd` device-selection, semantic-button profiles, shortcut defaults, or DSI output actions in this slice.
- Do not extract RockNIX guest-device ACL repair, user-audio bootstrap, or stage proof marker mechanics in this slice.
- Do not change Gamescope graphics/runtime profile ownership in this slice.
- Do not migrate FEX/Wine game package scaffolding or Ryubing's Turnip wrapper in this slice.
- Do not remove RK3566's `environment.systemPackages = [ (lib.hiPrio inputplumberDataPackage) ]` in this slice; the config check still uses that package presence as an observable composed-system signal.

### Deferred to Follow-Up Work

- Revisit SM8550 and x86 `XDG_DATA_DIRS` explicit overrides after the shared `extraDataPackages` option is proven on RK3566.
- Decide whether RK3566's `lib.hiPrio` data package belongs in a shared module or only in config-check discovery.
- Extract broader RockNIX guest profile, device ACL, and audio-bootstrap modules separately.

---

## Context & Research

### Relevant Code and Patterns

- `product/plugins/retroarch/nix/nixos-module.nix` is now the shared source of truth for RetroArch's InputPlumber udev/autodetect/autoconfig policy.
- `product/systems/nixos/images/platforms/rocknix-rk3566.nix` still defines `handheldRetroArchInputPolicy`, patches RK3566 InputPlumber data inline, and hand-builds InputPlumber `XDG_DATA_DIRS`.
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix` still patches the AYN InputPlumber package inline and keeps a deliberate explicit `XDG_DATA_DIRS` override that includes `/run/current-system/sw/share`.
- `product/systems/nixos/modules/korri-input.nix` already owns the normalized-input provider contract and is the right shared seam for provider-owned InputPlumber service environment defaults.
- `tools/testing/nix/korri-input-module-check.nix`, `tools/testing/nix/korri-rocknix-rk3566-config-check.nix`, `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`, and `tools/testing/nix/korri-live-usb-config-check.nix` are the relevant composed/module contracts.
- The xb360 helper needs its own narrow Nix check because composed-system checks can prove wiring without necessarily forcing every helper derivation's patch script.

### Institutional Learnings

- `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md`: shared policy should be explicit at the seam that owns it, not inferred or duplicated in consumers.
- `docs/solutions/architecture-patterns/architectural-posture-as-nix-image-default-2026-05-27.md`: shared modules should keep conservative behavior while image/platform layers declare posture and checks prove composed outputs.
- `docs/solutions/runtime-errors/retroarch-bare-passthru-wrapper-injects-l-coredir-2026-05-27.md`: RetroArch packaging and checks should verify explicit launcher-owned core/config behavior, not rely on wrapper side effects.
- `docs/solutions/integration-issues/steam-uinput-permissions-block-virtual-xinput-2026-06-13.md`: InputPlumber normalization and downstream virtual-input permissions are separate layers; this plan only touches InputPlumber normalization/data discovery.

### External References

- External research not used. Local NixOS module and platform-check patterns are sufficient for this bounded cleanup.

---

## Key Technical Decisions

- Keep this as a bounded refactor, not a broad platform architecture rewrite: The value is high because the drift is adjacent to the just-fixed RetroArch/InputPlumber seam, while larger input/audio/Gamescope findings need their own plans.
- Let the RetroArch plugin module remain the only RetroArch InputPlumber policy source: RK3566 should match SM8550 and live USB by consuming the shared `@korri:retroarch` platform-default policy.
- Add `extraDataPackages` to `services.korri.input.provider`: Platform adapters should declare data-package facts; the provider module should render InputPlumber's service environment consistently.
- Use a conservative module default for InputPlumber `XDG_DATA_DIRS`: The shared module should append the resolved `config.services.inputplumber.package` after all NixOS option merges and prepend declared extras, while explicit SM8550/x86 overrides continue to win until separately revisited.
- Extract the earned xb360 patch-and-verify abstraction, not two public one-off constructors: SM8550 and RK3566 may keep different package-shape construction locally, but the duplicated behavior should be the strict YAML patch routine shared by both.
- Preserve strict patch verification: The shared helper should fail if the source pattern is absent and also assert that the `xb360` target is present after patching.

---

## Open Questions

### Resolved During Planning

- Should SM8550/x86 `XDG_DATA_DIRS` be migrated now? No. RK3566 can prove the shared `extraDataPackages` seam with bit-for-bit equivalent ordering; SM8550 and x86 have deliberate `/run/current-system/sw/share` ordering differences and should stay explicit for this slice.
- Should RK3566's `environment.systemPackages` data-package exposure be removed? No. Keep it unchanged because the composed-system check currently discovers the data package through `environment.systemPackages`.
- Should xb360 patching use `substituteInPlace --replace-fail` alone? No. Keep a forward `grep` assertion for `xb360` so replacement typos fail at build time.
- Where should the helper live? Use `product/systems/nixos/images/inputplumber-platform-helpers.nix` for this slice; both current callers are image/platform adapters and no broader Nix library directory exists yet.

### Deferred to Implementation

- Exact option description wording in `korri-input.nix`: The implementer should follow the local option documentation style and keep the behavior clear without over-specifying future platforms.
- Exact helper function names: The helper should communicate full-package vs data-only package shape, but final naming can follow nearby Nix naming conventions during implementation.

---

## Implementation Units

### U1. Remove RK3566-local RetroArch policy

**Goal:** Make RK3566 consume the shared RetroArch plugin InputPlumber autoconfig policy instead of carrying its own local handheld baseline.

**Requirements:** R1, R4, R5

**Dependencies:** None

**Files:**
- Modify: `product/systems/nixos/images/platforms/rocknix-rk3566.nix`
- Modify: `tools/testing/nix/korri-rocknix-rk3566-config-check.nix`

**Approach:**
- Add the RK3566 check assertion for `retroarchPolicy.paths.joypadAutoconfigDirectory` before or atomically with removing the local policy.
- Remove the `handheldRetroArchInputPolicy` binding and its `host.plugin."@korri:retroarch"` assignment.
- Keep the RK3566-specific Gamescope host-layer environment override intact; that is not RetroArch input policy.
- Update misleading comments/check wording so the source of the policy is the shared RetroArch module.

**Execution note:** Start with the config-check assertion so the implementation proves the shared policy is already reaching RK3566 before the local policy disappears.

**Patterns to follow:**
- `tools/testing/nix/korri-rocknix-sm8550-config-check.nix` RetroArch InputPlumber autoconfig assertion.
- `tools/testing/nix/korri-live-usb-config-check.nix` shared autoconfig-dir assertion style.

**Test scenarios:**
- Happy path: RK3566 config evaluation sees `drivers.input = "udev"`, `drivers.joypad = "udev"`, autodetect enabled, player 1 index/dpad mode set, and `paths.joypadAutoconfigDirectory` ending in `/share/libretro/autoconfig`.
- Integration: Rendered RK3566 platform defaults still contain `@korri:retroarch` even after `rocknix-rk3566.nix` stops assigning that key locally.
- Regression: The RK3566 check must still reject platform defaults that introduce an `apps.retroarch` record or deprecated RetroArch app-record shape.

**Verification:**
- The RK3566 composed-system check passes with no `handheldRetroArchInputPolicy` definition remaining in `rocknix-rk3566.nix`.

---

### U2. Add shared InputPlumber extra data-package option

**Goal:** Teach the normalized-input provider module to render InputPlumber `XDG_DATA_DIRS` from provider package data plus declared extra data packages.

**Requirements:** R3, R4, R5

**Dependencies:** None

**Files:**
- Modify: `product/systems/nixos/modules/korri-input.nix`
- Modify: `tools/testing/nix/korri-input-module-check.nix`

**Approach:**
- Add `services.korri.input.provider.extraDataPackages` as a list-of-packages option with default `[]`.
- In the `isInputplumber` branch, set `systemd.services.inputplumber.environment.XDG_DATA_DIRS` at default priority from `extraDataPackages` followed by `config.services.inputplumber.package`'s `share` directory, not the pre-merge provider package option value.
- Keep the module default overrideable so SM8550 and x86 explicit platform assignments continue to win.
- Add module-check scenarios that prove baseline resolved-service-package data is present, extras prepend before the resolved service package, and the resolved service package remains present when extras are configured.

**Patterns to follow:**
- `services.korri.input.provider.services` option and InputPlumber branch in `product/systems/nixos/modules/korri-input.nix`.
- Existing scenario/evaluation structure in `tools/testing/nix/korri-input-module-check.nix`.

**Test scenarios:**
- Happy path: With provider `name = "inputplumber"` and no extras, the InputPlumber unit has `XDG_DATA_DIRS` containing the resolved `config.services.inputplumber.package` share directory.
- Happy path: With one extra data package, the generated `XDG_DATA_DIRS` starts with the extra package share directory and still contains the resolved service package share directory after it.
- Edge case: With multiple extra data packages, ordering is stable and preserves the caller-declared order before the resolved service package.
- Regression: A scenario that overrides `services.inputplumber.package` proves `XDG_DATA_DIRS` follows the resolved service package rather than the unmerged provider default.
- Regression: Non-InputPlumber or disabled-provider scenarios do not unexpectedly enable InputPlumber-specific service wiring beyond existing behavior.

**Verification:**
- The input module check proves the new option and generated environment without requiring a full platform image evaluation.

---

### U3. Migrate RK3566 InputPlumber data discovery to the shared option

**Goal:** Replace RK3566's hand-built InputPlumber `XDG_DATA_DIRS` assignment with the shared provider option while preserving current discovery ordering.

**Requirements:** R3, R4, R5

**Dependencies:** U2

**Files:**
- Modify: `product/systems/nixos/images/platforms/rocknix-rk3566.nix`
- Verify: `tools/testing/nix/korri-rocknix-rk3566-config-check.nix`

**Approach:**
- Set `services.korri.input.provider.extraDataPackages = [ inputplumberDataPackage ]` in the RK3566 platform adapter.
- Remove the RK3566-local `systemd.services.inputplumber.environment.XDG_DATA_DIRS` construction once the module option generates the same path ordering.
- Keep `environment.systemPackages = [ (lib.hiPrio inputplumberDataPackage) ]` unchanged in this slice so existing composed-system checks can still locate the package.
- Do not change SM8550 or x86 explicit `XDG_DATA_DIRS` overrides in this unit.

**Patterns to follow:**
- Existing RK3566 check `RG353M InputPlumber must discover product maps before package defaults`.
- `korri-removable-media.nix` pattern of platforms declaring facts while reusable modules render mechanics.

**Test scenarios:**
- Happy path: RK3566 InputPlumber unit `XDG_DATA_DIRS` still begins with the RK3566 data package share directory and then includes the resolved `config.services.inputplumber.package` share directory.
- Integration: RK3566 raw-gamepad hiding and provider service ordering remain unchanged.
- Regression: The RK3566 composed-system check asserts the full order, not only the data-package prefix, so it catches a wrong trailing service package.
- Regression: SM8550 and x86/live-USB checks that depend on their explicit `XDG_DATA_DIRS` ordering continue to pass because their platform assignments override the shared default.

**Verification:**
- RK3566 composed-system check passes and proves product maps are discovered before the resolved InputPlumber service package defaults.
- Input module check from U2 remains green after a real platform consumes the option.
- Live USB config check continues to prove x86's explicit InputPlumber data-dir ordering is not overridden by the module default.

---

### U4. Extract shared RockNIX InputPlumber xb360 patch helper

**Goal:** Replace duplicated inline xb360 YAML patching in SM8550 and RK3566 with a shared patch-and-verify helper while preserving each platform's package shape and patch ordering.

**Requirements:** R2, R4, R5

**Dependencies:** U3 recommended, because the RK3566 data package binding then has stable consumers through `extraDataPackages` and `environment.systemPackages`.

**Files:**
- Create: `product/systems/nixos/images/inputplumber-platform-helpers.nix`
- Modify: `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- Modify: `product/systems/nixos/images/platforms/rocknix-rk3566.nix`
- Create or modify: `tools/testing/nix/korri-inputplumber-xb360-helper-check.nix`
- Modify: `product/systems/nixos/flake/checks.nix`
- Verify: `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
- Verify: `tools/testing/nix/korri-rocknix-rk3566-config-check.nix`

**Approach:**
- Create a helper module imported by both platform adapters.
- Expose one earned abstraction for strict `xbox-series` to `xb360` YAML patching/verification; avoid exporting two one-consumer package constructors unless implementation proves a single patch helper cannot keep the callers clear.
- Keep platform-specific package-shape construction at the callers or behind a thin parameterized wrapper: SM8550 remains a full package copy; RK3566 remains a data-only package with extra map overlays.
- Preserve RK3566 ordering: copy base data, overlay extra map packages, then patch the target YAML to `xb360`.
- Preserve SM8550 behavior: copy the full substrate package, keep a derivation name containing `xb360`, and retain `meta.mainProgram = "inputplumber"` semantics.
- Use strict patch verification: fail when the `xbox-series` source line is absent and fail when the resulting YAML does not contain the `xb360` line.
- Add a narrow helper check with fixture data packages so the patch scripts are actually built and both success/failure behavior is exercised independently of composed-system wiring.

**Patterns to follow:**
- Existing SM8550 `substituteInPlace --replace-fail` derivation.
- Existing RK3566 data-package overlay order and forward/backward patch checks.
- Existing `gamescopeNix = import ... { inherit pkgs; }` style for platform helper imports.

**Test scenarios:**
- Happy path: SM8550 config still exposes an InputPlumber package whose derivation name contains `xb360`, and its service discovers that package before system defaults.
- Happy path: RK3566 config still exposes an InputPlumber data package whose name contains `inputplumber-data-xb360`, and its service discovers that data package before package defaults.
- Happy path: A helper-level fixture check builds a patched YAML tree and verifies the resulting target file contains an `xb360` line.
- Error path: A helper-level fixture check with no `xbox-series` line fails the derivation instead of silently emitting an unpatched package.
- Error path: The helper-level check covers the forward assertion that the resulting YAML contains `xb360` after replacement.
- Integration: RK3566 overlay maps are applied before the xb360 patch so the final target YAML reflects the product map override, not the base package file.

**Verification:**
- The helper-level check proves the patch helper builds success fixtures and fails closed for missing source patterns.
- SM8550 and RK3566 composed-system checks pass after both callers use the helper.
- No duplicate inline `xbox-series` to `xb360` patch logic remains in the two platform adapter files.

---

## System-Wide Impact

- **Interaction graph:** Platform adapters still declare physical-device facts; `korri-input.nix` owns InputPlumber provider service environment; `retroarch/nix/nixos-module.nix` owns RetroArch consumer policy; composed-system and helper-level checks prove the merge.
- **Error propagation:** Missing or changed InputPlumber YAML patterns should fail during the helper check or platform package build, not later as a runtime controller-mapping failure.
- **State lifecycle risks:** No persistent runtime state is migrated. The work changes generated NixOS configuration and package derivations only.
- **API surface parity:** The new provider option becomes part of the NixOS module surface for future platforms; no TypeScript runtime API changes are planned.
- **Integration coverage:** Module checks cover the shared provider option; helper checks cover xb360 patch behavior; platform checks cover RK3566, SM8550, and x86/live-USB composed outputs.
- **Unchanged invariants:** InputPlumber remains the normalized controller provider; RetroArch still consumes udev/autodetect/autoconfig policy; user/platform overrides can still supersede module defaults through normal NixOS option priority.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| RK3566 stops receiving RetroArch policy after local removal | Add the autoconfig-dir assertion before/with removal and verify the RK3566 config check. |
| Helper accidentally patches before RK3566 map overlay | Make overlay-before-patch part of U4 and test through the RK3566 composed check. |
| `XDG_DATA_DIRS` ordering changes for existing devices | Migrate only RK3566 where the generated value matches current ordering; leave SM8550/x86 explicit overrides intact and keep live-USB verification in the gate. |
| Shared module appends the wrong InputPlumber package | Use `config.services.inputplumber.package` in the generated environment and strengthen RK3566 checks to assert the trailing resolved package share path. |
| Helper changes derivation names and causes check/cache churn | Preserve required name substrings in helper/caller contracts; accept rebuilds as non-functional churn. |
| Composed-system checks do not force helper patch scripts | Add a narrow helper-level Nix check that builds patch fixtures and validates fail-closed behavior. |
| Module default unexpectedly affects future InputPlumber platforms | Use conservative provider-package-only default and document that platforms can override service env explicitly. |

---

## Documentation / Operational Notes

- No user-facing documentation is required for the cleanup itself.
- If implementation discovers that the shared `extraDataPackages` option should be advertised for platform authors, update the option description in `product/systems/nixos/modules/korri-input.nix`; do not create standalone docs in this slice.
- On-device Bandai/RK3566 deploy validation is useful but not required before landing the refactor; composed Nix checks are the primary gate for this plan.

---

## Sources & References

- Related code: `product/plugins/retroarch/nix/nixos-module.nix`
- Related code: `product/systems/nixos/modules/korri-input.nix`
- Related code: `product/systems/nixos/images/platforms/rocknix-rk3566.nix`
- Related code: `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- Related checks: `tools/testing/nix/korri-input-module-check.nix`
- Related checks: `tools/testing/nix/korri-inputplumber-xb360-helper-check.nix`
- Related checks: `tools/testing/nix/korri-rocknix-rk3566-config-check.nix`
- Related checks: `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
- Related checks: `tools/testing/nix/korri-live-usb-config-check.nix`
- Institutional learning: `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md`
- Institutional learning: `docs/solutions/architecture-patterns/architectural-posture-as-nix-image-default-2026-05-27.md`
