---
id: 01KZF92PTAPTM39VYDGMVHMTCY
slug: add-public-fixture-for-signed-odin-avb-pipeline
title: Add public fixture for signed Odin AVB pipeline
origin: parked
status: To Do
priority: medium
labels:
  - android
  - firmware
  - avb
  - testing
created: 2026-08-07
source: se-code-review
context:
  cwd: /home/simonwjackson/code/sandbox/korri/.worktrees/feat/odin2portal-signed-avb-dry-run
  branch: feat/odin2portal-signed-avb-dry-run
  repo: korri
---

# Add public fixture for signed Odin AVB pipeline

## Why it matters

The default signed AVB check covers key parsing, evidence redaction, key policy, and safety guards. The complete marker rebuild, descriptor reconstruction, signing, and publication path still needs the private stock capture and private key. A synthetic fixture would move this orchestration coverage into CI.

## Acceptance Criteria

- [ ] Default `odin2portal-signed-avb-dry-run-check` executes the complete signed AVB pipeline.
- [ ] Fixture uses distinct root, boot, recovery, and system keys to test chain-key preservation.
- [ ] Fixture tests wrong key identity, descriptor drift, full-manifest publication, and private-key exclusion.
- [ ] Private stock acceptance remains an additional integration gate.

## Related

- `clients/android/firmware/odin2portal/signed-avb-dry-run.sh`
- `clients/android/firmware/odin2portal/test-signed-avb-dry-run.sh`
