---
id: 01KVE9GAS465XHJ9ZV4BQSXNYF
slug: investigate-live-usb-korri-session-target-check-failure
title: Investigate live USB korri-session target check failure
origin: parked
status: To Do
priority: medium
labels:
  - nix
  - checks
  - live-usb
created: 2026-06-18
source: user
---

# Investigate live USB korri-session target check failure

## Why it matters

While validating the NES RetroArch bundle change, `nix build .#checks.x86_64-linux.korri-live-usb-config .#checks.x86_64-linux.korri-image-outputs --no-link` failed on `korri-session.target must start from the user default target`, which appears unrelated to the added Mesen core but blocks broader image checks.

## Acceptance Criteria

- [ ] `nix build .#checks.x86_64-linux.korri-live-usb-config --no-link` passes on trunk or the assertion is updated with a documented intentional behavior change.
- [ ] `nix build .#checks.x86_64-linux.korri-image-outputs --no-link` is no longer blocked by this live USB target assertion.

## Related

- `tools/testing/nix/korri-live-usb-config-check.nix`
- `tools/testing/nix/korri-image-outputs-check.nix`

## Notes

Observed from /tmp/korri-nes after NES/Mesen edits; failure message was not about RetroArch core count.
