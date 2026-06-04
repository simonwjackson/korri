---
id: 01KSRGFP0ABPMTCV8EJXDT9AH3
slug: sobo-reseed-acceptance-immutable-cleanup
title: Capture sobo reseed acceptance for the helper-immutable cleanup fix
origin: parked
legacy: task-019
status: To Do
priority: medium
labels:
  - follow-up
  - nix-on-rocks
  - sm8550
  - acceptance
created: 2026-05-29
source: se-work
---

# Capture sobo reseed acceptance for the helper-immutable cleanup fix (plan 001 U3)

## Context

Final unit (U3) of the [rocknix-guest-root-ensure immutable cleanup plan](../docs/plans/2026-05-29-001-fix-rocknix-guest-root-ensure-immutable-cleanup-plan.md), deferred from [simonwjackson/nix-on-rocks#3](https://github.com/simonwjackson/nix-on-rocks/pull/3) (merged 2026-05-30). The PR shipped U1 (the `clear_helper_immutable` helper in `patches/rocknix/0006-rocknix-guest-substrate.patch`) and U2 (five new substrate static-check assertions covering ordering and call sites). The remaining unit is a single sobo run that proves a reseed from the post-fix substrate clears the helper-owned immutable bits without operator intervention.

The original failure mode that motivated this plan: on the first Thor cutover, `rocknix-guest-root-ensure` aborted while deleting `/storage/nix-on-rock/rootfs/previous` because paths under `previous/var/empty` had `chattr +i` set, requiring a manual `chattr -R -i` before the unit would complete.

Repository: [simonwjackson/nix-on-rocks](https://github.com/simonwjackson/nix-on-rocks) (`/home/simonwjackson/code/sandbox/nix-on-rocks/`).

## Why it matters

Without device acceptance the fix is "covered at build time" but not "proven at runtime." The next operator who hits the trap (first reseed after a helper-owned `previous/` exists on a new device) is the actual test of whether the helper definition, ordering, and best-effort posture all behave as designed. Pinning the acceptance now also lets the plan move from `active` to `completed` and keeps the `docs/acceptance/` corpus honest.

## Trigger

Pick this up the next time sobo is online and idle. No prerequisite work; the substrate fix has already landed on `main` (commit a4a3b14).

## Acceptance Criteria

- [ ] Build a fresh SM8550 image from current nix-on-rocks `main` via [`build-image-only.yml`](https://github.com/simonwjackson/nix-on-rocks/blob/main/.github/workflows/build-image-only.yml) (Korri product payload + Odin2Portal lane).
- [ ] On sobo, touch `/flash/rocknix.reseed-guest` and reboot.
- [ ] `journalctl -u rocknix-guest-root-ensure` shows: (a) successful run, (b) the `chattr -R -i` step ran without aborting the unit, (c) no operator-side `chattr` was needed.
- [ ] `/storage/nix-on-rock/rootfs/current` is populated and `previous/` was cleaned by the unit itself.
- [ ] `/storage/nix-on-rock/rootfs/tmp` was removed cleanly (if a tmp_root cleanup ran during this reseed).
- [ ] Record acceptance under `docs/acceptance/sm8550-helper-immutable-cleanup-sobo-YYYY-MM-DD.md` in nix-on-rocks, including the journalctl excerpt.
- [ ] Flip plan `docs/plans/2026-05-29-001-fix-rocknix-guest-root-ensure-immutable-cleanup-plan.md` status from `active` → `completed`.

## Related

- nix-on-rocks PR #3 (merged 2026-05-30 as commit `937fa2e`): U1+U2 shipping
- nix-on-rocks `patches/rocknix/0006-rocknix-guest-substrate.patch`: helper definition + two call sites
- `docs/plans/2026-05-29-001-fix-rocknix-guest-root-ensure-immutable-cleanup-plan.md`
- `docs/acceptance/sm8550-product-payload-thor-bandai-2026-05-29.md`: the Thor acceptance that surfaced the trap
- sobo device: `root@192.168.1.239:22`

## Notes

Test design tradeoff: the cleanest evidence is a reseed where `previous/var/empty` *would have* triggered the old failure. Two ways to arrange that:

1. **Reuse natural state.** If sobo's `/storage/nix-on-rock/rootfs/previous` still carries the immutable bits from the earlier failed reseed (operator only cleared them on the live `current/`), trigger reseed normally and the unit will exercise the new code path on the way to deleting it.
2. **Synthesize.** SSH in, set `chattr +i` on a file under `previous/var/empty`, then trigger reseed. More deliberate, less faithful to natural drift.

Path 1 is preferred. Check sobo's `previous/` lsattr output before deciding which path to run.

Captured from `/se-work` session on 2026-05-29 closing out the substrate-followups PR.
