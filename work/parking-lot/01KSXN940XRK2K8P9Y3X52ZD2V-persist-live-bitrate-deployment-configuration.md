---
id: 01KSXN940XRK2K8P9Y3X52ZD2V
slug: persist-live-bitrate-deployment-configuration
title: Persist live bitrate deployment configuration
origin: parked
legacy: task-059
status: Done
priority: high
labels:
  - nix
  - sunshine
  - moonlight
  - deployment
  - runtime-settings
created: 2026-05-31
source: user
context:
---

# Persist live bitrate deployment configuration

## Why it matters

The successful validation used temporary Sunshine and Bandai runtime overrides; shippable support needs reproducible Nix/system configuration that survives reboot and does not depend on `/tmp` binaries or manual permission fixes.

## Acceptance Criteria

- [x] Patched `sunshine-korri` with the seamless VAAPI bitrate patch is deployed through normal Nix/system configuration on source hosts.
- [x] Sunshine starts with `SUNSHINE_LIVE_SETTINGS_MVP=1` only where intended and VAAPI initializes correctly from the service environment.
- [x] The libva/driver closure mismatch observed with copied binaries is eliminated or explicitly guarded against in deployment docs/checks.
- [x] Bandai/kiosk config persists the sessiond token permission fix, Moonlight input guard, and related service environment without runtime drop-ins.
- [x] A rollback path returns to the safe bitrate-unsupported contract if the VAAPI private-state path must be disabled.

## Related

- `packages/sunshine-korri/package.nix`
- `packages/sunshine-korri/patches/0005-add-seamless-vaapi-runtime-bitrate-path.patch`
- `nix/images/kiosk.nix`
- `nix/modules/korri-server.nix`
- `nix/images/source-machine.nix`

## Notes

Includes cleanup of the runtime-only Bandai service drop-in once real config lands.

Completed in this slice by making `services.korri.daemon.streaming.runtimeSettings.enable` the Nix-owned gate for `SUNSHINE_LIVE_SETTINGS_MVP`: enabled by default for managed stream hosts, disabled as the rollback path while keeping the patched `sunshine-korri` package deployed. Added Nix checks for source-machine Sunshine package/gate wiring, daemon-level rollback behavior, and SM8550 kiosk sessiond/InputPlumber env persistence without legacy token env.
