---
id: 01KXBEBSE9W5CX0KJH9ZETY8Z5
slug: harden-bandai-hook-privileges-replace-blanket-korri-sudo-wit
title: "Harden Bandai hook privileges: replace blanket korri sudo with scoped rules"
origin: parked
status: To Do
priority: medium
labels:
  - security
  - sudoers
  - hooks
  - sm8550
created: 2026-07-12
source: user
---

# Harden Bandai hook privileges: replace blanket korri sudo with scoped rules

## Why it matters

Launch hooks run as the korri user, and korri currently has blanket NOPASSWD sudo (required by the non-root nixos-rebuild deploy path in the SM8550 platform config). Combined with host.hooks.trust-removable, SD-card-authored hooks are effectively root on the device. Deliberate trade for owner-authored cards today, but the posture should become explicit and narrow: scoped security.sudo.extraRules allowing only the tuning commands hooks need (mount -o remount /sys, tee to cpufreq/devfreq sysfs paths) instead of unrestricted sudo. Note: argument-matched sudoers is brittle, and the root-helper alternative (korri-perf) was explicitly rejected by the user, so scoped sudoers is the realistic lever.

## Acceptance Criteria

- [ ] korri's blanket NOPASSWD sudo is replaced or supplemented with scoped rules covering hook tuning commands (remount /sys, tee to cpufreq/devfreq paths).
- [ ] nixos-rebuild non-root deploy path still works after the change.
- [ ] Existing Wonder/host hook YAML keeps working without edits.
- [ ] Posture documented where the trust-removable flag is documented.

## Related

- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- `product/platform/library/proseql/config-graph-db.ts`
