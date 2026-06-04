---
id: 01KSRGFP0009SDS1V3NX2G6M6X
slug: remove-sm8550-moonlight-substrate-module
title: Remove guest/modules/moonlight.nix from the nix-on-rocks SM8550 substrate
origin: parked
legacy: task-001
status: To Do
priority: medium
labels:
  - follow-up
  - nix-on-rocks
  - sm8550
created: 2026-05-29
source: se-work
---

# Remove `guest/modules/moonlight.nix` from the nix-on-rocks SM8550 substrate (U4 follow-up)

## Context

Final unit (U4) of the [SM8550 substrate capability boundary refactor plan](../01KSRGFP2QY612H6A1DSTPNGEZ-refactor-sm8550-substrate-capability-boundary/plan.md). Intentionally deferred from the first nix-on-rocks PR ([simonwjackson/nix-on-rocks#2](https://github.com/simonwjackson/nix-on-rocks/pull/2), merged) because the plan orders U4 *after* U5 — removing the module before Korri trunk stops setting `rocknix.sm8550.moonlight.*` would break Korri eval.

Repository: [simonwjackson/nix-on-rocks](https://github.com/simonwjackson/nix-on-rocks) (`/home/simonwjackson/code/sandbox/nix-on-rocks/`).

## Why it matters

U4 is the final piece of the capability boundary split: completing it removes the last product-leaning module (`rocknix.sm8550.moonlight.*`) from the nix-on-rocks substrate and finishes the plan's intent of making nix-on-rocks product-blind. Without it, the substrate keeps carrying a dormant Korri-shaped option group, which invites future drift.

## Trigger

Pick this up after the Korri-side U5 PR ([simonwjackson/korri#4](https://github.com/simonwjackson/korri/pull/4)) merges to `korri/trunk`. At that point Korri's trunk no longer sets `rocknix.sm8550.moonlight.{enable,package}` and the substrate option group is dormant.

## Acceptance Criteria

- [ ] `guest/profiles/rocknix-guest-base.nix` no longer imports `../modules/moonlight.nix`.
- [ ] `guest/modules/moonlight.nix` is deleted (no remaining substrate-side consumer; the `moonlight-embedded` *package* output stays in `flake.nix` for non-substrate consumers).
- [ ] `nix/tests/guest-profile-contract.nix` and `nix/tests/flake-surface-contract.nix` pass without referencing `rocknix.sm8550.moonlight.*`; add an assertion that the option group is gone if a removal-marker check helps.
- [ ] `nix flake check --no-build` is green; the four eval contracts (`guest-profile`, `audio-input-systemd`, `main-space-systemd`, `flake-surface`) all build.
- [ ] Korri's `rocknix-sm8550-config` check on `korri/trunk` still evaluates against the new nix-on-rocks rev (run a local flake.lock bump in a Korri scratch worktree to confirm before tagging the PR ready).
- [ ] Follow-up Korri cleanup commit removes the "scheduled for removal" NOTE comment in `nix/images/platforms/rocknix-sm8550.nix`.

## Related

- `../01KSRGFP2QY612H6A1DSTPNGEZ-refactor-sm8550-substrate-capability-boundary/plan.md`
- `nix/images/platforms/rocknix-sm8550.nix` (NOTE comment to clean up after)
- nix-on-rocks PR #2 (merged): the U1-U3 + substrate U6 docs that this depends on
- korri PR #4 (open): the U5 that this depends on

## Notes

This is a small PR: one file deletion, one import removal, possibly one test assertion addition. Before removing the package output, grep `nixosModules.moonlight-embedded` / `packages.moonlight-embedded` consumers outside the substrate base profile to confirm nothing else depends on it.

Captured from `/se-work` session on 2026-05-29 executing the SM8550 capability boundary plan.
