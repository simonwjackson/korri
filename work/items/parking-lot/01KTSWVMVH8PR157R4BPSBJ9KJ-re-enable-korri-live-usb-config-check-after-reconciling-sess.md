---
id: 01KTSWVMVH8PR157R4BPSBJ9KJ
slug: re-enable-korri-live-usb-config-check-after-reconciling-sess
title: Re-enable korri-live-usb-config check after reconciling session-start contract
origin: parked
status: To Do
priority: medium
labels:
  - ci
  - korri
  - live-usb
  - korri-login
created: 2026-06-10
source: user
context:
  cwd: /home/simonwjackson/code/sandbox/korri
  branch: trunk
  repo: korri
---

# Re-enable korri-live-usb-config check after reconciling session-start contract

## Why it matters

The korri-login refactor moved korri-session.target's start from the global user default.target to a per-user ~/.config/systemd/user/default.target.wants symlink (korri-login.nix), and the sm8550-kiosk-config check was updated to match but korri-live-usb-config-check.nix still asserts the old `wantedBy == ["default.target"]` contract. The check throws in desktop-stage2 build-x86_64 ("korri-session.target must start from the user default target"), blocking CI. It was temporarily disabled to unblock progress. Until restored, the live-USB appliance-target start path is unverified and may be a real regression (the symlink may not be produced for the mkLiveUsbKioskSystem path).

## Acceptance Criteria

- [ ] Determine whether mkLiveUsbKioskSystem (korriKioskLiveUsbSystem) actually produces the default.target.wants/korri-session.target symlink (login.enable/autologin true) or starts the target another way
- [ ] Fix the live-USB config OR update korri-live-usb-config-check.nix to the new per-user default.target.wants contract (mirror korri-rocknix-sm8550-config-check.nix)
- [ ] Uncomment `nix build .#checks.x86_64-linux.korri-live-usb-config --no-link` in .github/workflows/desktop-stage2.yml
- [ ] desktop-stage2 build-x86_64 passes on trunk

## Related

- `tools/testing/nix/korri-live-usb-config-check.nix`
- `product/systems/nixos/modules/korri-login.nix`
- `.github/workflows/desktop-stage2.yml`
- `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
