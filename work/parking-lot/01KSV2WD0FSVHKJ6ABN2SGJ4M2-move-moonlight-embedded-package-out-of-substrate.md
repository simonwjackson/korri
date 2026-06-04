---
id: 01KSV2WD0FSVHKJ6ABN2SGJ4M2
slug: move-moonlight-embedded-package-out-of-substrate
title: "Move packages/moonlight-embedded out of the substrate (revisits task-001's package-stays call)"
origin: parked
legacy: task-024
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

# Move `packages/moonlight-embedded` out of the substrate (revisits task-001's package-stays call)

## Context

Surfaced 2026-05-30 by the deep substrate-leak audit. `packages/moonlight-embedded/` on nix-on-rocks `origin/main` ships:

- `packages/moonlight-embedded/package.nix`, `manifest.nix`, `README.md`
- 5 patches: vendored ffmpeg DRM-prime, libdrm cmake fix, v4l2m2m platform, env-gated pacing experiments, `-absolutetouch` flag

Task-001 (already in backlog) covers removing `guest/modules/moonlight.nix` — the *module* that wires Moonlight into the substrate's option tree. Task-001 *deliberately* leaves the `moonlight-embedded` package in the substrate flake, reasoning at the time: "the `moonlight-embedded` *package* output stays in `flake.nix` for non-substrate consumers."

The deep audit revealed there are **no non-substrate consumers** of `packages.moonlight-embedded` — the only consumer is Korri itself, which already consumes the substrate flake. The "non-substrate consumer" rationale described a hypothetical that does not exist.

The package's own manifest header is product-shaped: it ships an `-absolutetouch` flag "opted in by Korri's launcher" and frames the patches as a Korri-specific touch-input pattern.

## Why it matters

task-001 closes one half of the moonlight leak (the module). task-024 closes the other half (the package). Without it, the substrate keeps shipping a Moonlight client with Korri-shaped patches even after task-001 lands. The "product-blind" claim is materially false for the package layer.

## Group

**Swing 2 — Package migration** (with task-022 steam, task-023 cemu, task-025 inputplumber). See task-022's Group section for the safety argument.

Ordering note: task-001 (module removal) can land independently or be folded into the Swing-2 PR. If folded, the Moonlight half of Swing 2 covers both module and package in one commit. Recommended: fold task-001 into Swing 2's moonlight commit, then close task-001 with a "completed by task-024" status note.

## Acceptance Criteria

### Substrate side (nix-on-rocks)

- [ ] Delete `packages/moonlight-embedded/` in its entirety.
- [ ] Remove `packages.moonlight-embedded` (and any `nixosModules.moonlight-embedded`) from `flake.nix`.
- [ ] Grep for and remove any remaining substrate-side consumers (`pkgs.moonlight-embedded`, `inputs.self.packages.<system>.moonlight-embedded`).
- [ ] `verify-product-payload --product odin2portal` and `--product thor` pass.
- [ ] `nix flake check --no-build` green.

### Korri side

- [ ] `packages/moonlight-embedded/` lives in Korri (or its satellite flake).
- [ ] The 5 patches move with the package.
- [ ] Korri's existing `KORRI_MOONLIGHT_COMMAND` env wiring resolves to the Korri-owned moonlight-embedded build (no substrate dependency).
- [ ] Existing Moonlight stream acceptance (e.g. the smoke on sobo) still passes.

### task-001 close-out

- [ ] If this lands first, task-001's module deletion becomes trivial; task-001 status either flips to "completed by task-024" or both close in the same PR.

## Related

- nix-on-rocks `packages/moonlight-embedded/`
- nix-on-rocks `guest/modules/moonlight.nix` (task-001's target)
- nix-on-rocks `guest/profiles/rocknix-guest-base.nix` (still imports the module per task-001's pinning note)
- korri `nix/images/platforms/rocknix-sm8550.nix:101` (the "NOTE: scheduled for removal" comment)
- task-001 (moonlight MODULE removal, predates this audit)
- task-022, task-023, task-025: peer Swing-2 items

## Notes

**Design questions to resolve before promoting:**

1. **Fold task-001 in or not?** Folding makes the Moonlight half of Swing 2 atomic (module + package gone in one commit). Keeping them separate respects the original task-001 sequencing rationale. Recommendation: fold, because the "non-substrate consumer" rationale that motivated separation no longer holds.

2. **Patch ownership.** The `-absolutetouch` patch is explicitly Korri-shaped. The other four (ffmpeg DRM-prime, libdrm cmake, v4l2m2m, pacing experiments) are SM8550-substrate-shaped (they target hardware/decoder behavior, not product policy). Question: do those four belong in the substrate as patches against a substrate-provided generic Moonlight, with only `-absolutetouch` moving? Or do all five move to Korri because the package itself moves? Recommendation: all five move with the package. Splitting patches across repos creates maintenance pain greater than the abstraction win.

3. **Update task-001's status when this is picked up** so the two tasks don't drift.

Captured from `/se-work` deep migration audit on 2026-05-30.
