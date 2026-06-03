---
id: task-112
title: Package TIC-80 libretro core as opt-in lane
status: To Do
priority: high
labels:
  - follow-up
  - libretro
  - tic80
  - nix
  - package-output
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

# Package TIC-80 libretro core as opt-in lane

## Context

TIC-80 has a mature libretro core and `pkgs.libretro.tic80` is available in nixpkgs with the expected libretro passthru shape:

- `pname = "libretro-tic80"`
- `passthru.core = "tic80"`
- `passthru.libretroCore = "/lib/retroarch/cores"`
- core binary: `tic80_libretro.so`
- supported content extension: `.tic`
- BIOS: none

This is a package/export lane only. Korri's default kiosk images currently enforce a single-core RetroArch closure, and that invariant must remain intact. Do not add TIC-80 to the existing fake-08 kiosk wrapper and do not touch default kiosk image core composition in this slice.

This work is the runtime counterpart to the Bazzar TIC-80 source-plugin backlog item. It makes the core available and verifiable in Korri without yet deciding how users opt into a TIC-80-specific runtime profile.

## Why it matters

TIC-80 is the easiest next fantasy-console runtime because Korri can consume the nixpkgs libretro package instead of maintaining a custom derivation. A small package lane gives future work a stable, tested output to depend on, catches nixpkgs passthru drift early, and preserves the default kiosk single-core constraint while enabling opt-in TIC-80 support later.

## Acceptance Criteria

### Package lane

- [ ] Create `packages/libretro-tic80/package.nix` as a thin wrapper around `pkgs.libretro.tic80` or `libretro.tic80`.
- [ ] Create `packages/libretro-tic80/check.nix` that verifies the artifact shape, following the fake-08/wasm4 package-check pattern.
- [ ] Assert at minimum: package name is `libretro-tic80`, `passthru.core == "tic80"`, `passthru.libretroCore == "/lib/retroarch/cores"`, and `${pkg}/lib/retroarch/cores/tic80_libretro.so` exists.
- [ ] Include an ELF magic check for `tic80_libretro.so` so the output is not just a path-shaped placeholder.
- [ ] Add a short `packages/libretro-tic80/README.md` explaining that Korri uses the nixpkgs TIC-80 core, not a custom derivation, and that kiosk opt-in is separate.

### Flake/overlay wiring

- [ ] Edit `nix/overlays/korri-packages.nix` to expose `libretro-tic80` without adding a new flake input.
- [ ] Edit `flake.nix` to expose `.#libretro-tic80` under packages.
- [ ] Add `libretro-tic80-check` under checks.
- [ ] Add `libretro-tic80-check` to the standard native/package-output check set if that is the established pattern.
- [ ] Add the check to the package-output owner matrix if applicable.

### Guardrails

- [ ] Do not edit `nix/images/kiosk.nix` in this slice.
- [ ] Do not add TIC-80 to the existing fake-08 `retroarchKiosk` closure.
- [ ] Do not weaken existing single-core closure assertions for SM8550, x86 kiosk, live USB, or developer live USB images.
- [ ] Do not introduce a custom TIC-80 source derivation unless the current nixpkgs pin cannot supply the required passthru/binary shape.
- [ ] Do not use `retroarch-bare.passthru.wrapper`; keep the explicit-core invocation model intact.

### Verification

- [ ] `nix build .#libretro-tic80 --no-link`
- [ ] `nix eval --raw .#libretro-tic80.passthru.core` returns `tic80`
- [ ] `nix eval --raw .#libretro-tic80.passthru.libretroCore` returns `/lib/retroarch/cores`
- [ ] `nix build .#checks.x86_64-linux.libretro-tic80-check --no-link`
- [ ] Run the relevant standard native/package-output check used by the repo.
- [ ] `just typecheck`
- [ ] `just test-unit`
- [ ] `just lint`

## Related

- `packages/libretro-fake-08/package.nix`
- `packages/libretro-fake-08/check.nix`
- `packages/libretro-fake-08/README.md`
- `packages/libretro-wasm4/package.nix`
- `packages/libretro-wasm4/check.nix`
- `nix/overlays/korri-packages.nix`
- `flake.nix`
- `docs/solutions/runtime-errors/retroarch-bare-passthru-wrapper-injects-l-coredir-2026-05-27.md`
- `docs/solutions/runtime-errors/retroarch-png-extension-routes-to-image-display-core-2026-05-27.md`
- https://docs.libretro.com/library/tic80/
- https://github.com/libretro/TIC-80
- https://github.com/nesbox/TIC-80

## Notes

Suggested worker prompt:

```text
Add TIC-80 as a package-only libretro core lane in Korri. Use pkgs.libretro.tic80; no new flake input. Create package/check/README under packages/libretro-tic80, wire the package and check through the overlay and flake outputs, and preserve the default kiosk single-core invariant. Do not edit nix/images/kiosk.nix. Verify package build, passthru.core=tic80, colocated check, typecheck, unit tests, and lint.
```
