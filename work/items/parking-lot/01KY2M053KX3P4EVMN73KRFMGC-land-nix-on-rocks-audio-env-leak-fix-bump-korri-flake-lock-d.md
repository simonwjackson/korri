---
id: 01KY2M053KX3P4EVMN73KRFMGC
slug: land-nix-on-rocks-audio-env-leak-fix-bump-korri-flake-lock-d
title: "Land nix-on-rocks audio env-leak fix: bump Korri flake.lock + drop Korri-side override"
origin: parked
status: To Do
priority: medium
labels:
  - audio
  - nix-on-rocks
  - substrate
  - deferred-data-wipe
created: 2026-07-21
source: se-debug
---

# Land nix-on-rocks audio env-leak fix: bump Korri flake.lock + drop Korri-side override

## Why it matters

The upstream fix (nix-on-rocks 5ffb595: stop exporting per-session runtime/audio env globally) is committed but not yet consumed by Korri. Bandai is currently patched only by the Korri-side session-shell-init reset (defense-in-depth). Landing the upstream removal kills the /run/user/0 leak at the source for all downstream images and lets the Korri-side override be simplified/removed. Deferred because bumping the nix-on-rocks input triggers an image/main-space update that wipes user data, and the operator needs a backup/restore window first.

## Acceptance Criteria

- [ ] nix-on-rocks commit 5ffb595 is on main and pushed
- [ ] Korri flake.lock nix-on-rocks input updated to include the fix
- [ ] A plain nix-on-rocks main-space device boots with working audio (root main-space regression check)
- [ ] Bandai rebuilt on the new pin; plain `nix run nixpkgs#jellyfin-desktop` has audio with no wrapper and no korriSessionShellInit override needed
- [ ] Decide whether to keep korriSessionShellInit reset as defense-in-depth or remove it

## Related

- `product/systems/nixos/modules/korri-runtime.nix`
- `flake.lock`
- `nix-on-rocks:guest/modules/audio.nix`
