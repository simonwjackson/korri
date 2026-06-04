---
id: 01KSRGFP0BCY1ECGWGP7R1H6HB
slug: guest-ssh-first-boot-lifecycle
title: Resolve open design questions and ship the guest SSH first-boot lifecycle
origin: parked
legacy: task-020
status: To Do
priority: medium
labels:
  - follow-up
  - nix-on-rocks
  - sm8550
  - ssh
  - operability
created: 2026-05-29
source: se-work
---

# Resolve open design questions and ship the guest SSH first-boot lifecycle (plan 002)

## Context

Drafted plan: [`docs/plans/2026-05-29-002-feat-guest-ssh-first-boot-access-lifecycle-plan.md`](https://github.com/simonwjackson/nix-on-rocks/blob/main/docs/plans/2026-05-29-002-feat-guest-ssh-first-boot-access-lifecycle-plan.md) (in nix-on-rocks). One of three follow-ups surfaced by the Thor / Bandai SM8550 acceptance on 2026-05-29. Sibling follow-ups already landed (plan 001 immutable cleanup, plan 003 substrate Phase 5 closeout). This one was deferred during the substrate-followups PR because the design questions had not been resolved, and shipping a half-designed SSH lifecycle on the substrate would be regression-prone.

Repository: [simonwjackson/nix-on-rocks](https://github.com/simonwjackson/nix-on-rocks).

## Why it matters

Today the guest SSH posture is whatever the substrate ships by default. There is no first-boot-aware policy for host-key persistence, no clear dev-mode opt-in for password access, and the schema for who-can-SSH-when leans on implicit substrate behavior. The Thor acceptance run repeatedly exposed friction around this — host keys regenerating on every reseed, no documented dev-mode escape hatch, ambiguous expectations about which user the recovery operator should use. Landing a real lifecycle removes a recurring source of operator confusion and unblocks future "ship a Korri device to a non-developer" scenarios.

## Trigger

Pick this up after the three open design questions are resolved (see Notes). Until then, this is genuinely blocked on a decision, not on capacity. When the questions are answered, the plan can be promoted to `se-work` (or split to `se-plan` if the answers expand scope).

## Acceptance Criteria

- [ ] Three design questions resolved and the resolutions captured in the plan body:
  - persistent host-key path
  - dev-mode random root password (yes / no)
  - schema minimalism (which knobs are mandatory vs. optional vs. computed)
- [ ] Substrate ships a deterministic first-boot SSH posture: host keys persist across reseeds, root login policy is explicit, dev-mode opt-in is documented.
- [ ] First-boot acceptance recorded under `docs/acceptance/sm8550-guest-ssh-first-boot-<device>-YYYY-MM-DD.md`.
- [ ] Substrate static checks cover the new posture's invariants (host-key path exists pre-`sshd`, no implicit password fallback unless dev-mode set, etc.).
- [ ] Plan status `draft` → `active` → `completed` as units land.

## Related

- `docs/plans/2026-05-29-002-feat-guest-ssh-first-boot-access-lifecycle-plan.md`
- `docs/acceptance/sm8550-product-payload-thor-bandai-2026-05-29.md`: where the friction surfaced
- nix-on-rocks PR #3 (merged): companion follow-ups (plans 001, 003) landed in parallel

## Notes

**Open design questions to resolve before kicking this off:**

1. **Persistent host-key path.** Where do generated host keys live so they survive a reseed? Likely under `/storage/nix-on-rock/state/ssh/` (parallel to other persistent state), but worth confirming against the substrate's existing persistence directories and the seed-vs-state boundary.

2. **Dev-mode random root password.** Does substrate ship a one-time random root password when a "dev mode" flag is set (e.g., `/flash/rocknix.dev-mode`)? Tradeoffs: convenience for a developer on a fresh device vs. an explicit footgun on a production device. If yes, where does the password surface (journal? `/flash/`? motd?) and how is it rotated.

3. **Schema minimalism.** What's the smallest set of substrate options that lets a product authority express its SSH posture? Candidate axes: `ssh.persistHostKeys` (bool), `ssh.allowRootLogin` (`never`/`key-only`/`password-when-dev-mode`), `ssh.devModeRandomPassword` (bool). Resist adding more until a real product needs it.

Captured from `/se-work` session on 2026-05-29 closing out the substrate-followups PR.
