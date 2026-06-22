---
id: 01KVPCZ1R0MN6HQFHK6B2G83NW
slug: repair-sobo-steam-seed-proton-directory-permission-failure
title: Repair Sobo Steam seed Proton directory permission failure
origin: parked
status: To Do
priority: medium
labels:
  - sobo
  - steam
  - deployment
created: 2026-06-22
source: user
---

# Repair Sobo Steam seed Proton directory permission failure

## Why it matters

Sobo deploys activate, but switch-to-configuration exits non-zero because korri-steam-seed.service cannot remove `/var/lib/korri/steam/steamapps/common/Proton 11.0 (ARM64)`. This can mask future deployment failures and leaves the system in `systemctl --failed` even when unrelated changes succeed.

## Acceptance Criteria

- [ ] `systemctl restart korri-steam-seed.service` succeeds on Sobo without manual deletion.
- [ ] `systemctl --failed` is empty after a Sobo generation switch.
- [ ] The Steam seed repair preserves existing Korri-managed Steam runtime state or documents any required migration.

## Related

- `product/plugins/steam`
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- `Sobo `/var/lib/korri/steam/steamapps/common/Proton 11.0 (ARM64)``

## Notes

Observed during YFS launcher deploy. `nixos-rebuild switch` activated generation `/nix/store/s07s5bxsdh6r2hkvn3hmcv8pq8i1kxhq-nixos-system-sobo-25.11pre-git` but exited 4 because `korri-steam-seed.service` logged `rm: cannot remove ... Permission denied`. YFS deployment and launch proof were otherwise successful.
