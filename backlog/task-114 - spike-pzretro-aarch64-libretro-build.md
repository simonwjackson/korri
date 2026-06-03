---
id: task-114
title: Spike pzretro aarch64 libretro build
status: To Do
priority: high
labels:
  - follow-up
  - puzzlescript
  - pzretro
  - libretro
  - nix
  - aarch64
  - runtime-spike
created: 2026-06-02
source: user
context:
  cwd: .
  branch: trunk
  commit: f1ba15e
  repo: korri
  invoked_by: puzzlescript-korri-research
---

# Spike pzretro aarch64 libretro build

## Context

PuzzleScript runtime support depends on `pzretro`, an unofficial libretro core that embeds the original PuzzleScript JavaScript engine through QuickJS and loads `.pz`/`.pzp` source files. The core exists, but it is not consumable like TIC-80:

- `pkgs.libretro.puzzlescript` does not exist in nixpkgs.
- The official libretro BuildBot aarch64 nightly list does not ship `puzzlescript_libretro.so`.
- `nwhitehead/pzretro` releases include Linux x86_64 and ARMv7/Genesis Mini binaries, but no aarch64 release.
- `libretro-core-info` has `puzzlescript_libretro.info`, so RetroArch metadata exists when the core is available.
- The pzretro project is low-velocity; last release was v0.2.1 in 2022.

Before Korri creates a durable package lane or runtime profile, prove whether pzretro can build and minimally load on the target architecture family. This is a spike, not product integration: do not wire PuzzleScript into kiosk images or user-visible launch config yet.

Research artifacts from 2026-06-02:

- `/tmp/puzzlescript-korri-research/best-practices.md`
- `/tmp/puzzlescript-korri-research/framework-docs.md`
- `/tmp/puzzlescript-korri-research/web-ecosystem.md`
- `/tmp/puzzlescript-korri-research/repo-fit.md`

## Why it matters

PuzzleScript source acquisition is attractive, but a source plugin is much less useful if Korri cannot run the resulting `.pz` files offline on target devices. This spike de-risks the highest-uncertainty runtime question cheaply: whether Korri can build and package `puzzlescript_libretro.so` for aarch64/SM8550 with acceptable artifact shape and basic behavior. A clear no-go here prevents downstream package/profile work from becoming speculative.

## Acceptance Criteria

### Build feasibility

- [ ] Identify the exact pzretro upstream commit or release to test, preferably the latest stable tagged release or a recent commit with reproducible source.
- [ ] Confirm the source license is MIT and compatible with Korri packaging.
- [ ] Confirm submodules/vendor sources needed by the simple build path are available under deterministic fetches.
- [ ] Attempt a Nix-managed build of `puzzlescript_libretro.so` for the native host.
- [ ] Attempt or evaluate an aarch64 build path using the repo's cross/system conventions.
- [ ] Prefer pzretro's simple `make` path with pregenerated files before introducing `gn`/`ninja`; document if the simple path is insufficient.
- [ ] Record any patches needed for Linux/aarch64, compiler warnings-as-errors, QuickJS portability, or install paths.

### Artifact-shape proof

- [ ] The build output contains `lib/retroarch/cores/puzzlescript_libretro.so` or a clearly mappable equivalent path.
- [ ] The output includes or can be paired with `puzzlescript_libretro.info` from upstream/libretro-core-info.
- [ ] ELF magic check passes for the produced `.so`.
- [ ] Runtime metadata can support the future passthru contract: `core = "puzzlescript"`, `libretroCore = "/lib/retroarch/cores"`.
- [ ] Supported extensions are verified as `.pz` and `.pzp`.
- [ ] No BIOS/firmware dependency is introduced.

### Minimal runtime smoke

- [ ] Use a tiny MIT-licensed PuzzleScript fixture or repo-owned fixture `.pz` file.
- [ ] Prove RetroArch can at least load/init the core with the fixture on a supported build host, or document why CI cannot execute it and what device/QEMU command is required.
- [ ] Capture whether the core requires full paths, saves, or any unusual content-loading behavior that differs from standard libretro cores.
- [ ] Check for obvious line-ending sensitivity and document that `.pz` artifacts should be normalized to LF by source plugins.

### Decision output

- [ ] Produce a concise go/no-go note in the backlog item or a follow-up implementation plan: viable package lane, viable with patches, or not viable.
- [ ] If viable, include the recommended `packages/libretro-puzzlescript/package.nix` shape and pinned source strategy.
- [ ] If not viable, capture the blocker precisely and recommend either browser-runtime exploration or dropping/deprioritizing PuzzleScript runtime support.
- [ ] Identify whether runtime performance on ARM is likely acceptable for turn-based games and whether real-time PuzzleScript games should be marked compatibility-risk.

### Guardrails

- [ ] Do not edit `nix/images/kiosk.nix`.
- [ ] Do not add PuzzleScript to default fake-08 kiosk closures.
- [ ] Do not weaken existing single-core image checks.
- [ ] Do not commit a half-wired user-visible runtime if the aarch64 build is unproven.
- [ ] Do not assume BuildBot or nixpkgs will supply the core later; the spike should evaluate current Korri-owned packaging viability.

### Verification

- [ ] Native Nix build command for the spike derivation/package succeeds or fails with documented blocker.
- [ ] aarch64 build/eval command succeeds or fails with documented blocker.
- [ ] If a temporary check derivation is created, it verifies `.so` existence and ELF magic.
- [ ] Existing Korri default package/image checks are not modified or weakened.

## Related

- `packages/libretro-fake-08/package.nix`
- `packages/libretro-fake-08/check.nix`
- `packages/libretro-wasm4/package.nix`
- `packages/libretro-wasm4/check.nix`
- `packages/libretro-tic80/package.nix`
- `nix/overlays/korri-packages.nix`
- `flake.nix`
- `docs/solutions/runtime-errors/retroarch-bare-passthru-wrapper-injects-l-coredir-2026-05-27.md`
- https://github.com/nwhitehead/pzretro
- https://github.com/libretro/libretro-core-info/blob/master/puzzlescript_libretro.info
- https://buildbot.libretro.com/nightly/linux/aarch64/latest/
- https://github.com/increpare/PuzzleScript

## Notes

Suggested worker prompt:

```text
Spike pzretro for Korri. Determine whether nwhitehead/pzretro can build `puzzlescript_libretro.so` for native Linux and aarch64 using Nix. Do not wire it into kiosk images. Prefer the simple make path with pregenerated files. Verify artifact shape, ELF magic, core id `puzzlescript`, supported extensions `.pz|.pzp`, and no BIOS. Use a tiny MIT-licensed `.pz` fixture for a bounded RetroArch load smoke if feasible. Return a go/no-go and the recommended package-lane shape if viable.
```
