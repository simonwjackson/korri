---
id: 01KZF3YVZVF181EWDYZH6SPWQ9
slug: add-deterministic-fixture-for-full-odin-marker-pipeline
title: Add deterministic fixture for full Odin marker pipeline
origin: parked
status: To Do
priority: medium
labels:
  - android
  - firmware
  - testing
created: 2026-08-07
source: se-code-review
context:
  cwd: /home/simonwjackson/code/sandbox/korri/.worktrees/feat/odin2portal-marker-dry-run
  branch: feat/odin2portal-marker-dry-run
  repo: korri
---

# Add deterministic fixture for full Odin marker pipeline

## Why it matters

The default marker check covers ext4 marker behavior and safety rejections, while full lpunpack, AVB, lpmake, and publication coverage still requires the private 6 GB stock capture. A synthetic fixture would make that orchestration regression test available in CI without proprietary firmware.

## Acceptance Criteria

- [ ] Default `odin2portal-marker-dry-run-check` invokes `marker-dry-run.sh` through a deterministic fixture.
- [ ] Fixture covers logical unpack/repack, unsigned AVB output, quarantined artifact publication, and post-publish checksum gates.
- [ ] Private-source acceptance remains available as an additional integration gate.

## Related

- `clients/android/firmware/odin2portal/marker-dry-run.sh`
- `clients/android/firmware/odin2portal/test-marker-dry-run.sh`
