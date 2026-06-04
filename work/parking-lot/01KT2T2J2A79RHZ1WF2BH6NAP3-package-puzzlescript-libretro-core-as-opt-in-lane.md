---
id: 01KT2T2J2A79RHZ1WF2BH6NAP3
slug: package-puzzlescript-libretro-core-as-opt-in-lane
title: Package PuzzleScript libretro core as opt-in lane
origin: parked
legacy: task-115
status: To Do
priority: medium
labels:
  - follow-up
  - puzzlescript
  - pzretro
  - libretro
  - nix
  - package-output
  - fantasy-console
created: 2026-06-02
source: user
context:
---

# Package PuzzleScript libretro core as opt-in lane

## Context

After `task-114` proves pzretro can build on the target architecture family, Korri should add a package/check lane for PuzzleScript. This is analogous to fake-08/WASM-4 custom package lanes, not TIC-80's nixpkgs wrapper lane.

Expected runtime facts when viable:

- Source project: `nwhitehead/pzretro`
- Core id: `puzzlescript`
- Core binary: `puzzlescript_libretro.so`
- Supported extensions: `.pz`, `.pzp`
- BIOS: none
- Engine approach: QuickJS running the original PuzzleScript JS engine
- License: MIT for engine/core; individual games still require their own license evidence

This backlog item is package-only. It should expose a reproducible `.#libretro-puzzlescript` package and an artifact-shape check without adding PuzzleScript to default kiosk images or launch config.

## Why it matters

A package lane gives Korri a stable, testable core artifact to depend on before any user-visible runtime profile is added. It also codifies the pzretro build in Nix so future source-plugin and runtime-profile work can target a known binary path instead of ad hoc local builds. Keeping this opt-in preserves the default fake-08 single-core closure invariant.

## Acceptance Criteria

### Prerequisite

- [ ] `task-114` has produced a go decision: pzretro builds for the required architecture family, or the package lane includes the patches needed to make that true.
- [ ] Any required pzretro patches are documented and justified.
- [ ] The selected source revision is pinned and reproducible.

### Package files

- [ ] Create `packages/libretro-puzzlescript/package.nix` as a custom derivation for `nwhitehead/pzretro`.
- [ ] Create `packages/libretro-puzzlescript/check.nix` following the colocated package-check pattern.
- [ ] Create `packages/libretro-puzzlescript/README.md` explaining source provenance, core id, extensions, no-BIOS status, aarch64 caveats, and opt-in posture.
- [ ] Add `puzzlescript_libretro.info` if upstream/package output does not already install an appropriate info file.
- [ ] Add `packages/libretro-puzzlescript/patches/` only if required by the build spike.

### Derivation behavior

- [ ] Build installs `puzzlescript_libretro.so` under `lib/retroarch/cores/`.
- [ ] Package exposes `passthru.core = "puzzlescript"`.
- [ ] Package exposes `passthru.libretroCore = "/lib/retroarch/cores"`.
- [ ] Package name is stable and recognizable, e.g. `libretro-puzzlescript`.
- [ ] The simple pzretro `make` path is used if sufficient; `gn`/`ninja` are introduced only if necessary and documented.
- [ ] Build inputs are minimal and deterministic.
- [ ] The derivation remains portable across `x86_64-linux` and target `aarch64-linux` where Korri expects runtime support.

### Check behavior

- [ ] `check.nix` asserts package name/passthru contract.
- [ ] `check.nix` asserts the core `.so` exists at the expected path.
- [ ] `check.nix` performs an ELF magic check on `puzzlescript_libretro.so`.
- [ ] `check.nix` verifies core metadata or `.info` content includes `corename = "puzzlescript"` and `supported_extensions = "pz|pzp"` when available.
- [ ] The check fails clearly if the package output shape drifts.

### Flake/overlay wiring

- [ ] Edit `nix/overlays/korri-packages.nix` to expose `libretro-puzzlescript`.
- [ ] Edit `flake.nix` to expose `.#libretro-puzzlescript` under packages.
- [ ] Add `libretro-puzzlescript-check` under checks.
- [ ] Add the check to the standard native/package-output check set if consistent with the repo pattern.
- [ ] Add package/check ownership metadata to any package-output owner matrix if applicable.
- [ ] Do not add new flake inputs unless the custom derivation requires a pinned source input and the repo pattern favors flake inputs over fetchFromGitHub.

### Guardrails

- [ ] Do not edit `nix/images/kiosk.nix` in this slice.
- [ ] Do not add PuzzleScript to the existing fake-08 `retroarchKiosk` closure.
- [ ] Do not weaken existing single-core closure assertions.
- [ ] Do not use `retroarch-bare.passthru.wrapper`; Korri runtime profiles should use explicit `-L <core.so>` later.
- [ ] Do not bundle PuzzleScript games in this package; this package is core/runtime only.

### Verification

- [ ] `nix build .#libretro-puzzlescript --no-link`
- [ ] `nix eval --raw .#libretro-puzzlescript.passthru.core` returns `puzzlescript`
- [ ] `nix eval --raw .#libretro-puzzlescript.passthru.libretroCore` returns `/lib/retroarch/cores`
- [ ] `nix build .#checks.x86_64-linux.libretro-puzzlescript-check --no-link`
- [ ] Target/aarch64 package build or check command passes where supported.
- [ ] Existing default image/package checks still pass.
- [ ] `just typecheck`
- [ ] `just test-unit`
- [ ] `just lint`

## Related

- `./01KT2T2J29TKWZHYZBYRN2A303-spike-pzretro-aarch64-libretro-build.md`
- `packages/libretro-fake-08/package.nix`
- `packages/libretro-fake-08/check.nix`
- `packages/libretro-fake-08/README.md`
- `packages/libretro-wasm4/package.nix`
- `packages/libretro-wasm4/check.nix`
- `packages/libretro-tic80/package.nix`
- `nix/overlays/korri-packages.nix`
- `flake.nix`
- https://github.com/nwhitehead/pzretro
- https://github.com/libretro/libretro-core-info/blob/master/puzzlescript_libretro.info
- https://github.com/increpare/PuzzleScript

## Notes

Suggested worker prompt:

```text
Package PuzzleScript pzretro as a Korri libretro package lane after the aarch64 spike is viable. Create packages/libretro-puzzlescript/package.nix, check.nix, and README. Pin nwhitehead/pzretro, install puzzlescript_libretro.so under lib/retroarch/cores, expose passthru.core="puzzlescript" and passthru.libretroCore="/lib/retroarch/cores", wire through overlay/flake packages/checks, and preserve default kiosk single-core invariants. Do not add games or runtime profile in this slice.
```
