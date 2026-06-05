---
id: task-030
title: Fix sessiond runtime token ACL persistence
status: To Do
priority: high
labels:
  - bug
  - nixos
  - sessiond
  - launch
created: 2026-06-05
source: user
---

# Fix sessiond runtime token ACL persistence

## Why it matters

On Bandai, korri-sessiond's generated unit contains the sharedGroup token setup script, but after a normal service restart /run/korri-sessiond and token ended up root:root, causing korri-server managed launches to fail with HostUnavailable/exit 126 until the setup script was run manually. This makes local game launch fragile across restarts and can be mistaken for gamescope/RetroArch failures.

## Acceptance Criteria

- [ ] Restarting korri-sessiond leaves /run/korri-sessiond owned/traversable by the configured shared group and token root:<sharedGroup> 0640.
- [ ] korri-server user can read KORRI_SESSIOND_TOKEN_FILE after every sessiond restart without a manual ExecStartPre rerun.
- [ ] A NixOS check or VM/unit assertion covers the sharedGroup runtime directory and token ownership contract.

## Related

- `product/systems/nixos/modules/korri-sessiond.nix`
- `product/systems/nixos/images/kiosk.nix`

## Notes

Observed on bandai: active unit ExecStartPre script chowns root:korri-server chmod 0640, but after restart token was root:root and korri-server could not read it. Manual run of /nix/store/...-korri-sessiond-token-setup fixed live launch auth.
