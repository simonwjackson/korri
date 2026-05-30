---
id: task-022
title: Move packages/steam out of the nix-on-rocks substrate
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

# Move `packages/steam` out of the nix-on-rocks substrate

## Context

Surfaced 2026-05-30 by a deep audit of substrate Korri-knowledge leaks after closing the substrate-followups PR. `packages/steam/` on nix-on-rocks `origin/main` ships:

- `packages/steam/package.nix`, `manifest.nix`
- `packages/steam/scripts/{steam-arm64-bootstrap,steam-arm64-seed,steam-guest-native,steam-guest-run,steam-guest-runtime-prep}`
- `packages/steam/resources/{compatibilitytool.vdf,registry.vdf,toolmanifest.vdf}`
- `packages/steam/tests/*.sh`

Steam is a product-stack choice, not an SM8550 capability. The substrate gives a product the ability to run x86-64 binaries under emulation and to wire up controllers; whether that product wants Steam, Heroic, Lutris, or nothing is a downstream call.

The boundary-lint script `scripts/check-boundary-lint` currently *enforces* that the Steam package keeps a specific manifest shape, which means the substrate is not just shipping Steam — it's also asserting Steam's internal invariants. That coupling has to move with the package.

## Why it matters

Until this lands, a non-Korri product that doesn't want Steam still gets the Steam package built into the substrate flake's package surface, and any changes to that package have to go through the substrate's review/CI cycle. The substrate's "product-blind" claim is materially false for any product that doesn't want a Steam runtime.

## Group

**Swing 2 — Package migration** (with task-023 cemu, task-024 moonlight-embedded, task-025 inputplumber). Safe to land these four as one PR with four atomic commits because: same pattern (delete package + remove flake export + delete lint guards + add Korri-side input), zero file overlap between commits, one CI cycle.

Depends on **Swing 1** (task-032) landing first only if task-029 (lint cleanup) is in scope; otherwise Swing 2 can run independently.

## Acceptance Criteria

### Substrate side (nix-on-rocks)

- [ ] Delete `packages/steam/` in its entirety.
- [ ] Remove Steam-related exports from `flake.nix` (`packages.steam`, any `nixosModules.steam`).
- [ ] Strip Steam-specific assertions from `scripts/check-boundary-lint` (the `packages/steam/**` invariants block).
- [ ] `verify-product-payload --product odin2portal` and `--product thor` still pass after removal.
- [ ] `nix flake check --no-build` is green.
- [ ] Boundary lint passes (with the Steam invariants removed, not bypassed).

### Korri side

- [ ] `packages/steam/` lives in Korri (or in a Korri-owned satellite flake), wired into the product payload for `korri-rocknix-kiosk-{odin2portal,thor}`.
- [ ] Korri-side equivalent of the substrate's Steam invariants (manifest shape, script source-policy guardrails) ships alongside the package.
- [ ] Existing Korri SM8550 image build still produces a working Steam runtime — confirmed via the existing Steam smoke acceptance, not a new acceptance.

## Related

- nix-on-rocks `packages/steam/` (entire directory)
- nix-on-rocks `scripts/check-boundary-lint` (Steam invariants block, ~10 lines)
- Korri-side existing Steam usage (the receiver)
- task-023, task-024, task-025: peer Swing-2 items
- task-029: lint cleanup, lands after Swing 2

## Notes

**Design questions to resolve before promoting:**

1. **Does Korri have a `packages/` directory by convention?** If not, decide whether to add one or stash the package in a satellite flake (`korri-packages` or similar). The substrate-followups arc deliberately avoided spawning satellite repos; landing this without one is the lower-friction choice.

2. **Source-policy guardrails (steam-package-contract.sh).** These currently live in the substrate and assert "Steam scripts don't call systemctl/swaymsg/gamescope, don't hardcode /storage." Those invariants are still valuable; they just need to ship with the package in its new home.

3. **Pinning.** The substrate currently uses `pkgs.callPackage ./packages/steam`. The receiver in Korri can do the same shape; no pinning surface change needed unless Korri wants to drift from substrate-pinned nixpkgs.

Captured from `/se-work` deep migration audit on 2026-05-30.
