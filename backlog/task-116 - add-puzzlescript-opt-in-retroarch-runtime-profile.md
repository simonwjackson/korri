---
id: task-116
title: Add PuzzleScript opt-in RetroArch runtime profile
status: To Do
priority: medium
labels:
  - follow-up
  - puzzlescript
  - pzretro
  - libretro
  - retroarch
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
  invoked_by: puzzlescript-korri-research
---

# Add PuzzleScript opt-in RetroArch runtime profile

## Context

Once pzretro is proven and packaged (`task-114` and `task-115`), Korri can expose PuzzleScript as an opt-in runtime profile. The expected runtime contract is:

```text
core id: puzzlescript
core binary: puzzlescript_libretro.so
stable core path: /etc/korri/cores/puzzlescript_libretro.so
content extensions: .pz, .pzp
ROM folder convention: /storage/roms/puzzlescript/
BIOS: none
launch: retroarch -L /etc/korri/cores/puzzlescript_libretro.so /storage/roms/puzzlescript/<game>.pz
```

This is a runtime/profile task, not source acquisition. Bazzar's PuzzleScript plugin should produce `.pz` artifacts, but this Korri task decides how those artifacts are launched on device while preserving existing kiosk invariants.

The default Korri kiosk images intentionally carry exactly one libretro core. Existing closure-shape checks protect that invariant. PuzzleScript must be an explicit opt-in profile/variant and must not be appended to the default fake-08 kiosk closure.

## Why it matters

PuzzleScript source acquisition becomes product-useful only when Korri can launch `.pz` files reliably with gamepad-friendly RetroArch behavior. A separate opt-in profile keeps this capability isolated from default PICO-8/fake-08 images, avoids unexpected closure growth, and gives PuzzleScript-specific compatibility/performance issues a clear testing lane.

## Acceptance Criteria

### Dependencies

- [ ] `task-114` confirms pzretro is viable on the target architecture family.
- [ ] `task-115` lands `.#libretro-puzzlescript` with a passing package/check lane.
- [ ] A legal fixture `.pz` file exists for automated or manual smoke validation.

### Runtime profile design

- [ ] Define a separate PuzzleScript-enabled runtime/kiosk profile or package output.
- [ ] The default fake-08 kiosk image remains unchanged.
- [ ] The profile exposes `/etc/korri/cores/puzzlescript_libretro.so` only where PuzzleScript support is enabled.
- [ ] The profile's RetroArch composition contains exactly the intended PuzzleScript core unless a deliberate multi-core product profile is separately designed and tested.
- [ ] The profile does not require a browser runtime for `.pz` playback.

### Launch configuration

- [ ] Add or document Cascade/library YAML for PuzzleScript:
  ```yaml
  modules:
    puzzlescript:
      kind: libretro-core
      path: /etc/korri/cores/puzzlescript_libretro.so

  systems:
    puzzlescript:
      name: PuzzleScript
      extensions: [.pz, .pzp]
      launch:
        app: retroarch
        module: puzzlescript
  ```
- [ ] Confirm `ModulePayload` and `retroarch` app integration accept this without schema changes, or add targeted schema tests if a change is needed.
- [ ] Confirm content paths under `/storage/roms/puzzlescript/` are accepted by the library/import path intended for this profile.
- [ ] Ensure the runtime invokes RetroArch with explicit `-L /etc/korri/cores/puzzlescript_libretro.so` and does not rely on a core directory wrapper.

### Input and compatibility

- [ ] Document RetroPad mapping from pzretro: D-pad movement, A action, Y undo, START restart, L escape, SELECT+LEFT/RIGHT level navigation.
- [ ] Identify any Korri gamepad/inputd assumptions that need no changes because RetroArch handles the mapping.
- [ ] Document that `.pzp`/PuzzleScript Plus support is experimental/compatibility-risk if pzretro behavior confirms that.
- [ ] Document that real-time PuzzleScript games may be ARM performance-risk while turn-based puzzle games are the primary supported shape.
- [ ] Confirm save-state/save behavior and note any limitations; pzretro savestates are serialized but level progress may depend on RetroArch state usage.

### Tests and closure assertions

- [ ] Add a PuzzleScript-specific closure-shape check for the opt-in profile: exactly one libretro core and that core is `puzzlescript`.
- [ ] Existing fake-08/SM8550/x86/live-USB image output checks continue to assert the default core shape unchanged.
- [ ] Add a config/check assertion that `/etc/korri/cores/puzzlescript_libretro.so` resolves to the packaged pzretro core in the opt-in profile.
- [ ] If the profile emits run commands or manifests, assert they contain `-L /etc/korri/cores/puzzlescript_libretro.so` and a `.pz`/`.pzp` content path.

### Runtime smoke

- [ ] Add or reference a tiny MIT-licensed `.pz` fixture, preferably from the PuzzleScript repo or repo-owned fixture content.
- [ ] Prove RetroArch can launch/init the fixture with `puzzlescript_libretro.so` in a bounded automated smoke where feasible.
- [ ] If CI cannot execute the core, document a manual QEMU/device smoke command and keep automated gates focused on closure and launch-command shape.
- [ ] Verify LF-normalized `.pz` files work; document line-ending sensitivity if observed.

### Guardrails

- [ ] Do not edit default kiosk image composition except to preserve explicit non-PuzzleScript behavior.
- [ ] Do not weaken single-core closure checks.
- [ ] Do not add Chromium/browser closure as part of this RetroArch profile.
- [ ] Do not use `.html` as the runtime artifact for pzretro.
- [ ] Do not bundle arbitrary PuzzleScript gallery games into the image without explicit per-game redistribution rights.
- [ ] Do not treat the engine MIT license as covering game content.

### Verification

- [ ] `nix build .#libretro-puzzlescript --no-link`
- [ ] Build/evaluate the PuzzleScript opt-in profile/check output.
- [ ] Existing default image closure checks still pass.
- [ ] New PuzzleScript profile closure check passes.
- [ ] `just typecheck`
- [ ] `just test-unit`
- [ ] `just lint`
- [ ] Manual or automated launch smoke evidence is recorded for at least one `.pz` fixture.

## Related

- `backlog/task-114 - spike-pzretro-aarch64-libretro-build.md`
- `backlog/task-115 - package-puzzlescript-libretro-core-as-opt-in-lane.md`
- `docs/deployment/korri-launch-config.md`
- `nix/images/kiosk.nix`
- `nix/tests/korri-rocknix-sm8550-config-check.nix`
- `nix/tests/korri-live-usb-config-check.nix`
- `nix/tests/korri-image-outputs-check.nix`
- `korri/shared/library/config/records/module.ts`
- `korri/shared/library/config/app-integrations.ts`
- `tools/importers/rocknix/`
- `docs/solutions/runtime-errors/retroarch-bare-passthru-wrapper-injects-l-coredir-2026-05-27.md`
- https://github.com/nwhitehead/pzretro
- https://github.com/libretro/libretro-core-info/blob/master/puzzlescript_libretro.info
- https://onionui.github.io/docs/emulators/puzzlescript

## Notes

Suggested worker prompt:

```text
Add a PuzzleScript opt-in RetroArch runtime profile after libretro-puzzlescript is packaged. Preserve the default fake-08 single-core kiosk invariant. Expose puzzlescript_libretro.so at /etc/korri/cores/puzzlescript_libretro.so only for the opt-in profile, add launch/config examples or schema tests as needed, and add closure-shape checks proving the PuzzleScript profile has exactly the puzzlescript core. Use .pz/.pzp content under /storage/roms/puzzlescript. Do not add browser runtime or bundle unlicensed games.
```
