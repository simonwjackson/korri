---
id: 01KSV2WD0HK5QPBHF208V8YAWR
slug: move-product-shaped-launchers-out-of-substrate
title: Move product-shaped launchers out of guest/launchers into Korri
origin: parked
legacy: task-026
status: To Do
priority: medium
labels:
  - follow-up
  - nix-on-rocks
  - product-blind
  - sm8550
  - swing-3-launchers
created: 2026-05-30
source: se-work
---

# Move product-shaped launchers out of `guest/launchers/` into Korri

## Context

Surfaced 2026-05-30 by the deep substrate-leak audit. `guest/launchers/` on nix-on-rocks `origin/main` contains a bulk of product-specific shell launchers that have no business in a product-blind substrate:

- `botw-guest.sh` — a launcher for a specific game (Breath of the Wild)
- `games-launcher.sh` — touch-friendly Korri game picker
- `cemu-sm8550-performance.sh`, `cemu-storage-adapter.sh` — Cemu policy
- `launch-host-cemu-through-guest-display.sh` — Cemu / host orchestration
- `pair-moonlight-embedded.sh` — Moonlight pairing
- `remote-cemu-runner.sh`, `remote-cemu-live-campaign.sh`, `remote-cemu-build-fingerprint.sh`, `remote-cemu-cleanup.sh` — entire Cemu remote orchestration family
- `start_cemu_guest.sh` — Cemu entry point
- `host-tune.sh` — host CPU/GPU tuning policy
- `README.md` — describes the above

Two of these (`remote-cemu-runner.sh:134`, `remote-cemu-live-campaign.sh:151`) literally `systemctl start korri-kiosk.service`, hardcoding the downstream product's unit name in substrate-shipped code.

`scripts/check-boundary-lint` *enforces* invariants on several of these (`start_cemu_guest.sh` env handling, `botw-guest.sh` quoting policy, the `remote-cemu-*` family's `ROCKNIX_GUEST_SERVICE` env shape, Cubeb fingerprint evidence). Those invariants move with the launchers.

## Why it matters

Until this lands, the substrate's `guest/launchers/` is a Korri product launcher library wearing a substrate name. A non-Korri product can't add a launcher without going through substrate review. The lint script's "Korri-shape" invariants get richer over time, making each future move more painful.

This is the single largest "scope shrink" available to the substrate — ~13 shell scripts, ~15 lint guards. After it lands the substrate's `guest/launchers/` either disappears or becomes very small (only generic helpers, if any).

## Group

**Swing 3 — Launcher migration** (single-task swing). One PR with the bulk move + the lint cleanup that comes with it.

Depends on **Swing 1** (task-032) if any of the moved launchers want to use the new `rocknix.session.kioskUnit` option instead of hardcoded `korri-kiosk.service` references. Otherwise the launchers move to Korri with the hardcoded name (which is now accurate in their new home).

Coupled to **Swing 2** because `start_cemu_guest.sh` and the `remote-cemu-*` family invoke the Cemu binary. If task-023 has moved the package, references update naturally; if Swing 2 hasn't landed yet, the launchers reference the substrate-provided binary and break when Swing 2 ships. Recommended sequencing: Swing 3 lands first (Korri-side launchers reference the substrate-provided binary, will switch when Swing 2 lands), or Swing 2 + Swing 3 land in one mega-PR.

## Acceptance Criteria

### Substrate side (nix-on-rocks)

- [ ] Delete every product-shaped launcher in `guest/launchers/` (full list in Context).
- [ ] Audit any remaining files in `guest/launchers/` (e.g. `README.md`, any genuinely-generic helper) for whether they belong in the substrate at all. If none survive, delete the directory.
- [ ] Strip launcher-shape assertions from `scripts/check-boundary-lint`:
  - `start_cemu_guest.sh` env / delegation invariants
  - `botw-guest.sh` quoting / CPU-GPU-affinity invariants
  - `remote-cemu-*.sh` `ROCKNIX_GUEST_SERVICE` invariants
  - Cubeb evidence invariant
- [ ] `verify-product-payload --product odin2portal` and `--product thor` pass.
- [ ] `nix flake check --no-build` green.
- [ ] No substrate code (modules, profiles, tests) references the moved launchers by path.

### Korri side

- [ ] Launchers land in Korri under a product-owned location (suggested: `korri/products/app/launchers/` or `korri/shared/launchers/` depending on which product uses them; current usage is Korri-wide).
- [ ] Korri-side equivalents of the substrate's launcher invariants ship alongside (same source-policy lints, just in Korri's check infrastructure).
- [ ] Korri's existing game-launch flow (BOTW boot, Cemu run, Moonlight stream) still works on sobo (Odin2Portal) and on Thor — confirmed via existing acceptance, not a new acceptance.

### Static check at substrate / payload seam

- [ ] Add a substrate-side assertion: `guest/launchers/` either does not exist, or contains zero files that mention `korri`, `cemu`, `botw`, `moonlight`, or any product-specific identifier. This becomes the regression guard for "no more product launchers in the substrate."

## Related

- nix-on-rocks `guest/launchers/` (full directory inventory)
- nix-on-rocks `scripts/check-boundary-lint` (launcher invariants, ~25 lines)
- task-022, task-023, task-024: callers of these launchers; sequencing depends on which Swing lands first
- task-032: kiosk-unit parameterization (may be consumed by some moved launchers)
- task-029: lint cleanup task; some of the cleanup folds in here, the rest waits

## Notes

**Design questions to resolve before promoting:**

1. **Which Korri-side directory?** Korri's product structure (`korri/products/app/...`) suggests `korri/products/app/launchers/` for app-tier launchers. Alternative: `korri/shared/launchers/` if launchers cross products. Decide by reading how Korri currently references / invokes these (today: from outside the substrate via `/storage/.guest/<name>.sh` paths).

2. **Path coupling.** Several launchers are invoked by hardcoded paths (`/storage/.guest/games-launcher.sh`, etc.) baked into substrate sway configs or device profiles. The substrate side of this move includes ripping out those hardcoded paths or replacing them with payload-supplied paths. Decide which approach in the PR description.

3. **Order with Swing 2.** See Group section. Recommendation: Swing 3 first (launchers reference the substrate binary), then Swing 2 (package moves; launchers in their new Korri home are updated in the same PR that moves the package).

4. **What about `start_cemu_guest.sh`'s `SYSTEM_CEMU` / `PROMOTED_CEMU` / `REQUESTED_CEMU` shape?** That env shape is a real handoff seam between substrate-provided Cemu and a developer-promoted Cemu. If the package moves to Korri, the seam still matters but the "system" side is now Korri-provided. Worth a re-read with the package move in scope.

Captured from `/se-work` deep migration audit on 2026-05-30.
