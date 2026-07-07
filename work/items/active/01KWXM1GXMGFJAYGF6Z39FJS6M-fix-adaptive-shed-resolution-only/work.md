---
id: 01KWXM1GXMGFJAYGF6Z39FJS6M
slug: fix-adaptive-shed-resolution-only
title: Fix adaptive shed stopping after resolution-only rescue
type: fix
status: completed
created: 2026-07-07
source: live-validation
priority: high
labels:
  - stream-control
  - adaptive
  - validation-regression
---

# Fix adaptive shed stopping after resolution-only rescue

Plan and implementation work for the live Bandai validation regression where adaptive rescue applied the resolution floor but did not continue to bitrate/FPS floor, despite manual stream-control commands succeeding.
