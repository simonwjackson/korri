---
id: task-023
title: Move packages/cemu out of the nix-on-rocks substrate
status: To Do
priority: medium
labels:
  - follow-up
  - nix-on-rocks
  - product-blind
  - sm8550
  - swing-2-packages
created: 2026-05-30
source: se-work
---

# Move `packages/cemu` out of the nix-on-rocks substrate

## Context

Surfaced 2026-05-30 by the deep substrate-leak audit. `packages/cemu/` on nix-on-rocks `origin/main` ships:

- `packages/cemu/package.nix`, `manifest.nix`
- `packages/cemu/000-build-fixes.patch`, `002-opt-seeprom-mlc01-keys-dir.patch`, `003-disable-cmake-interprocedural-optimization.patch`
- `packages/cemu/README.md`

The package's own manifest header is honest about it: *"ROCKNIX cemu-sa package contract translated for the Layer 14 Nix guest"* — a specific game-emulator chosen for a specific product, not an SM8550 capability.

The boundary-lint script `scripts/check-boundary-lint` currently asserts Cemu package invariants (`vulkan_loader_lib_path`, `audio_backend_lib_path`, Cubeb backend gating, `cemu_wrapper_dir` exec shape) — substrate code guarding product package internals.

## Why it matters

Cemu in the substrate makes the substrate a Wii-U-emulator vendor. Until this lands, every Cemu build issue routes through the substrate's review and CI cycle. A non-Korri product authority cannot ship without a Cemu derivation. The substrate's "product-blind" claim is materially false at the package layer.

## Group

**Swing 2 — Package migration** (with task-022 steam, task-024 moonlight-embedded, task-025 inputplumber). See task-022's Group section for the safety argument.

## Acceptance Criteria

### Substrate side (nix-on-rocks)

- [ ] Delete `packages/cemu/` in its entirety.
- [ ] Remove Cemu-related exports from `flake.nix` (`packages.cemu`, any `nixosModules.cemu`).
- [ ] Strip Cemu-specific assertions from `scripts/check-boundary-lint` (the `packages/cemu/package.nix` invariants block).
- [ ] `verify-product-payload --product odin2portal` and `--product thor` still pass.
- [ ] `nix flake check --no-build` green.
- [ ] Boundary lint passes (with Cemu invariants removed, not bypassed).

### Korri side

- [ ] `packages/cemu/` lives in Korri (or its satellite flake), wired into the product payload.
- [ ] Equivalent Cemu package-internal invariants ship alongside the package in Korri.
- [ ] Existing Korri SM8550 image build still produces a working Cemu binary — confirmed via existing Cemu smoke, not a new acceptance.

### Coupling with task-026

- [ ] If task-026 (launcher migration) has not already moved the Cemu launchers (`botw-guest.sh`, `cemu-sm8550-performance.sh`, `cemu-storage-adapter.sh`, the `remote-cemu-*` family, `start_cemu_guest.sh`), confirm they continue to invoke the Cemu binary correctly with the new package location. Otherwise this commit fixes those references; if task-026 lands first, they're already gone from the substrate.

## Related

- nix-on-rocks `packages/cemu/`
- nix-on-rocks `scripts/check-boundary-lint` (Cemu invariants block, ~10 lines at the tail)
- nix-on-rocks `guest/launchers/cemu-*.sh`, `botw-guest.sh`, `remote-cemu-*.sh` (callers — they reference `SYSTEM_CEMU=` and use the substrate-provided binary)
- task-022, task-024, task-025: peer Swing-2 items
- task-026: launcher migration (overlapping callers)

## Notes

**Design questions to resolve before promoting:**

1. **Where does ROCKNIX upstream-path tracking live?** The Cemu manifest tracks `upstreamPath = "projects/ROCKNIX/packages/emulators/standalone/cemu-sa/patches/..."`. That tracking is product-policy (it says "we want to stay close to ROCKNIX's Cemu") and should follow Korri, not stay in the substrate.

2. **Ordering with task-022, task-024, task-025.** All four packages are independent files. Cleanest commit order in the Swing 2 PR: Steam → Cemu → Moonlight-embedded → InputPlumber (alphabetical), each commit self-contained.

Captured from `/se-work` deep migration audit on 2026-05-30.
