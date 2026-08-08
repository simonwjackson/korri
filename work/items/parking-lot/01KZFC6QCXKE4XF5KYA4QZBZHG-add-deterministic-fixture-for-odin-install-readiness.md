---
id: 01KZFC6QCXKE4XF5KYA4QZBZHG
slug: add-deterministic-fixture-for-odin-install-readiness
title: Add deterministic fixture for Odin install readiness
origin: parked
status: To Do
priority: medium
labels:
  - android
  - firmware
  - testing
created: 2026-08-08
source: se-code-review
context:
  cwd: /home/simonwjackson/code/sandbox/korri/.worktrees/docs/odin2portal-install-procedure
  branch: docs/odin2portal-install-procedure
  repo: korri
---

# Add deterministic fixture for Odin install readiness

## Why it matters

The default readiness check covers rejection guards, while its full success path uses the private multi-gigabyte signed and rollback artifacts. A compact fixture would make external hash contracts, exact inventories, operator-file integrity, and private-key rejection available in CI.

## Acceptance Criteria

- [ ] Default `odin2portal-install-readiness-check` exercises the successful readiness path.
- [ ] Tests reject changed signed hashes, changed operator documents, extra files, wrong rollback metadata, wrong sizes, symlinks, and PEM private-key content.
- [ ] Private real-artifact readiness remains an additional integration gate.

## Related

- `clients/android/firmware/odin2portal/install-readiness.sh`
- `clients/android/firmware/odin2portal/test-install-readiness.sh`
- `clients/android/firmware/odin2portal/INSTALL.md`
