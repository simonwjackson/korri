---
id: task-029
title: Strip product-specific assertions from scripts/check-boundary-lint
status: To Do
priority: medium
labels:
  - follow-up
  - nix-on-rocks
  - product-blind
  - sm8550
  - swing-4-lint-cleanup
created: 2026-05-30
source: se-work
---

# Strip product-specific assertions from `scripts/check-boundary-lint`

## Context

Surfaced 2026-05-30 by the deep substrate-leak audit. `scripts/check-boundary-lint` on nix-on-rocks `origin/main` is itself product-aware. It currently contains positive assertions on product-specific code that should not be in the substrate at all:

- Cemu package internals: `vulkan_loader_lib_path`, `audio_backend_lib_path`, `USE_PULSE`, `USE_ALSA`, `cemu_wrapper_dir` exec shape (~10 lines)
- Steam package internals: `steam-guest-runtime-prep`, `steam-guest-run` manifest entries, script source-policy (~12 lines)
- Cemu launchers: `start_cemu_guest.sh` env/delegation, the `remote-cemu-*` family's `ROCKNIX_GUEST_SERVICE` shape, Cubeb evidence path (~25 lines)
- BOTW launcher: `botw-guest.sh` quoting and CPU/GPU policy boundary (~3 lines)

These are "substrate code guarding product invariants." They were sensible when the substrate shipped these things; once Swing 2 (packages) and Swing 3 (launchers) land, the things being guarded no longer exist in the substrate.

The substrate's *negative* assertions (the guards that flake.nix doesn't import Korri, that profiles don't write `services.korri`, etc.) are correct and stay — they're the actual "product-blind" guard.

## Why it matters

Until this lands, after Swings 2-3 the lint script is **broken** because it asserts on files that no longer exist. The lint would either need to be deleted in a rush (regressing the negative guards) or stripped section-by-section in a follow-up. Doing it as an explicit Swing-4 cleanup keeps the negative guards intact.

It also closes a small but real conceptual hole: a "product-blind" substrate cannot have a lint script that knows what Cemu's wrapper script looks like.

## Group

**Swing 4 — Lint cleanup** (single-task swing). Lands after Swings 2 and 3 because it removes guards for code that those swings move. Lands before Swing 5 because Swing 5 (dogfood second product) needs a clean lint that doesn't fail on the absence of Cemu/Steam/BOTW.

If Swings 2 and 3 are bundled into one mega-PR, the lint cleanup may fold into the same PR's final commit. If they're separate PRs, this is its own follow-up.

## Acceptance Criteria

### Remove product-specific positive assertions

- [ ] Steam package invariants block — removed.
- [ ] Cemu package invariants block — removed.
- [ ] `start_cemu_guest.sh` invariants — removed.
- [ ] `botw-guest.sh` invariants — removed.
- [ ] `remote-cemu-*.sh` family invariants — removed.
- [ ] Cubeb evidence assertion — removed.

### Keep substrate-shape guards

- [ ] Negative assertions about `korri.url` not being a flake input — kept.
- [ ] Negative assertions about `services.korri.*` / `korri.nixosModules` / `korri.packages` in profiles, modules, README — kept.
- [ ] Negative assertions about substrate-internal invariants (XDG runtime dir, KillUserProcesses, logind ownership) — kept; these are substrate-side rules, not product-side.
- [ ] New negative assertion from task-032: no hardcoded Korri unit names in `guest/modules/` or `guest/profiles/`.
- [ ] New negative assertion: `guest/launchers/` either empty or contains no files mentioning product-specific identifiers (from task-026's "static check at substrate / payload seam" item).

### Optional: rename or split

- [ ] Optional: consider splitting `check-boundary-lint` into `check-substrate-blindness` (negative guards) and `check-substrate-internals` (positive guards on substrate-owned code). Not required; named here for design discussion.

### Verification

- [ ] `./scripts/check-boundary-lint` exits 0 against the post-Swing-3 substrate.
- [ ] If a developer reintroduces `services.korri` in a substrate profile, the lint fails. (Test by adding the violation in a scratch worktree, confirming lint fails, removing.)

## Related

- nix-on-rocks `scripts/check-boundary-lint`
- task-022, task-023, task-024, task-025 (Swing 2): remove the package code that the positive lint guards target
- task-026 (Swing 3): removes the launcher code that the positive lint guards target
- task-032: adds new negative guards this task enforces; writes the invariants doc this lint enforces

## Notes

**Design questions to resolve before promoting:**

1. **Split or stay one file?** Splitting clarifies intent (blindness guards vs. substrate-internal guards) but adds a second CI hook. Recommendation: stay one file with section headers; revisit only if the file grows past ~200 lines after Swing-2+3 cleanup.

2. **Source-policy guardrails (the "no systemctl, no swaymsg, no gamescope, no /storage" lines).** Those are correct *as substrate invariants* — the substrate's own scripts shouldn't reach for those things either. They should stay even after the packages they currently guard leave. Reword the source-policy section to be substrate-internal, not package-specific.

3. **When does this land?** Strictly after Swings 2 and 3, because it removes guards on code that those Swings delete. If they're one mega-PR, the lint cleanup is the last commit in that PR.

Captured from `/se-work` deep migration audit on 2026-05-30.
