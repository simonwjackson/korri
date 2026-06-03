---
id: task-113
title: Add TIC-80 opt-in kiosk runtime profile
status: To Do
priority: medium
labels:
  - follow-up
  - libretro
  - tic80
  - kiosk
  - runtime
  - fantasy-console
created: 2026-06-02
source: user
context:
  cwd: .
  branch: trunk
  commit: f1ba15e
  repo: korri
  invoked_by: tic80-korri-research
---

# Add TIC-80 opt-in kiosk runtime profile

## Context

After `task-112` lands, Korri should be able to expose TIC-80 as an opt-in runtime profile without breaking the default fake-08 kiosk images. TIC-80 runtime facts:

- libretro core id: `tic80`
- core binary: `tic80_libretro.so`
- stable Korri path should be `/etc/korri/cores/tic80_libretro.so`
- content extension: `.tic`
- ROM folder convention on ROCKNIX: `/storage/roms/tic-80/`
- BIOS: none
- base resolution: 240×136 at 60 FPS
- RetroArch invocation: `retroarch -L /etc/korri/cores/tic80_libretro.so /storage/roms/tic-80/<cart>.tic`

The current default kiosk image composition intentionally carries exactly one libretro core. Existing closure-shape checks assert this because one-core-per-kiosk keeps image closure size and runtime selection predictable. TIC-80 should therefore be a separate opt-in profile/variant or selected through an explicit product/runtime option, not appended to the existing fake-08 kiosk wrapper.

## Why it matters

TIC-80 source acquisition is only useful to Korri users if acquired `.tic` carts can be launched through a supported runtime. This follow-up turns the package lane into a usable runtime while preserving the single-core kiosk invariant. Keeping it opt-in avoids regressing fake-08/PICO-8 images and gives future fantasy-console profiles a repeatable pattern.

## Acceptance Criteria

### Dependency

- [ ] `task-112` has landed or equivalent `.#libretro-tic80` package/check output exists.
- [ ] The TIC-80 package exposes `tic80_libretro.so` with `passthru.core == "tic80"`.

### Runtime profile design

- [ ] Define an explicit opt-in path for TIC-80 runtime support: a separate kiosk profile, separate package output, or a documented runtime/core selection option.
- [ ] The design preserves default fake-08 image behavior and does not silently add TIC-80 to every kiosk closure.
- [ ] The selected path exposes `/etc/korri/cores/tic80_libretro.so` only for the TIC-80-enabled profile.
- [ ] The RetroArch wrapper/profile contains exactly one intended libretro core unless a deliberate multi-core product profile is designed and tested separately.

### Launch configuration

- [ ] Add or document Cascade/library YAML shape for TIC-80:
  ```yaml
  modules:
    tic80:
      kind: libretro-core
      path: /etc/korri/cores/tic80_libretro.so

  systems:
    tic-80:
      name: TIC-80
      extensions: [.tic]
      launch:
        app: retroarch
        module: tic80
  ```
- [ ] Confirm `ModulePayload` and app integration validation already accept this without schema changes, or add targeted schema tests if a change is required.
- [ ] Confirm `.tic` content paths under `/storage/roms/tic-80/` are accepted by the library/import path intended for this profile.

### Tests and closure assertions

- [ ] Add a TIC-80-specific closure-shape assertion for the opt-in profile: exactly one libretro core, and that core is `tic80`.
- [ ] Existing fake-08/SM8550/x86/live-USB image output checks continue to assert the default core shape unchanged.
- [ ] Add a config/check assertion that `/etc/korri/cores/tic80_libretro.so` resolves to the TIC-80 core in the opt-in profile.
- [ ] If a generated run command or launch manifest exists for the profile, assert it uses `-L /etc/korri/cores/tic80_libretro.so` and does not invoke a core directory wrapper.

### Runtime smoke

- [ ] Add a minimal fixture `.tic` cart or use a legally permitted TIC-80 demo cart with explicit source evidence for smoke validation.
- [ ] Prove RetroArch can be invoked against the fixture in a bounded non-interactive or artifact-shape smoke, if feasible on CI.
- [ ] If CI cannot execute the core, document the manual device/QEMU smoke command and keep automated checks focused on closure and launch command shape.

### Guardrails

- [ ] Do not use `retroarch-bare.passthru.wrapper`; it injects core-directory arguments that conflict with Korri's explicit `-L <core.so>` contract.
- [ ] Do not rename `.tic` files to `.png`, `.tic.png`, or any PICO-8-specific workaround extension.
- [ ] Do not claim save-state/rewind capabilities beyond what the TIC-80 libretro core actually supports.
- [ ] Do not bundle arbitrary tic80.com carts into the image unless each cart has explicit redistribution/license evidence.

### Verification

- [ ] `nix build .#libretro-tic80 --no-link`
- [ ] Build/evaluate the TIC-80 opt-in package/profile/check output.
- [ ] Existing default image closure checks still pass.
- [ ] New TIC-80 profile closure check passes.
- [ ] `just typecheck`
- [ ] `just test-unit`
- [ ] `just lint`
- [ ] Manual or automated launch smoke evidence is recorded for at least one `.tic` fixture/cart.

## Related

- `backlog/task-112 - package-tic-80-libretro-core-as-opt-in-lane.md`
- `docs/deployment/korri-launch-config.md`
- `nix/images/kiosk.nix`
- `nix/tests/korri-rocknix-sm8550-config-check.nix`
- `nix/tests/korri-live-usb-config-check.nix`
- `nix/tests/korri-image-outputs-check.nix`
- `korri/shared/library/config/records/module.ts`
- `korri/shared/library/config/app-integrations.ts`
- `tools/importers/rocknix/`
- `docs/solutions/runtime-errors/retroarch-bare-passthru-wrapper-injects-l-coredir-2026-05-27.md`
- `docs/solutions/runtime-errors/retroarch-png-extension-routes-to-image-display-core-2026-05-27.md`
- https://docs.libretro.com/library/tic80/
- https://rocknix.org/systems/tic-80/
- https://wiki.batocera.org/systems:tic80

## Notes

Suggested worker prompt:

```text
Add TIC-80 as an opt-in Korri runtime profile after libretro-tic80 package output exists. Preserve the default fake-08 single-core kiosk invariant. Expose tic80_libretro.so at /etc/korri/cores/tic80_libretro.so only for the opt-in profile, add launch/config examples or schema tests as needed, and add closure-shape checks proving the TIC-80 profile has exactly the tic80 core. Do not bundle tic80.com carts without explicit redistribution rights.
```
