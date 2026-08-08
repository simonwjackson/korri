---
id: 01KZFRJ4VHD39TA7DGS7Y7FS14
slug: add-full-public-fixture-for-odin-launcher-image-pipeline
title: Add full public fixture for Odin launcher image pipeline
origin: parked
status: To Do
priority: high
labels:
  - android
  - firmware
  - testing
created: 2026-08-08
source: se-code-review
context:
  cwd: /home/simonwjackson/code/sandbox/korri/.worktrees/feat/odin2portal-korri-launcher
  branch: feat/odin2portal-korri-launcher
  repo: korri
---

# Add full public fixture for Odin launcher image pipeline

## Why it matters

The launcher-image check validates APK and static guards, while the real ext4, dynamic-partition, and AVB paths currently depend on the private stock integration run. A compact real-tool fixture would catch regressions without proprietary firmware or keys.

## Acceptance Criteria

- [ ] Default launcher-image check executes a successful compact ext4, super, and AVB build.
- [ ] Tests cover output races, source/APK/key drift, unsafe key modes, filesystem failures, signer rejection, and publication cleanup.
- [ ] The real private-stock build remains an additional integration gate.

## Related

- `clients/android/firmware/odin2portal/launcher-product-dry-run.sh`
- `clients/android/firmware/odin2portal/launcher-image-dry-run.sh`
- `clients/android/firmware/odin2portal/test-launcher-image-dry-run.sh`
