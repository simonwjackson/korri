---
id: 01KYWQHENPAHCP3YHFQDHWMVZK
slug: split-library-scale-records-out-of-fuse-backed-yaml-before-f
title: Split library-scale records out of FUSE-backed YAML before first full release
origin: parked
status: To Do
priority: medium
labels:
  - proseql
  - storage
  - performance
  - android
  - pre-release
created: 2026-07-31
source: user
---

# Split library-scale records out of FUSE-backed YAML before first full release

## Why it matters

proseQL comes in first and everything lives in user-visible shared storage, which is right: config the user cannot find is config the user cannot own, and at config scale the cost is nothing. Measured on usu, a whole-tree rebuild from shared storage costs about 20x internal — 3.7ms at 10 fragments, 64ms at 200, 760ms at 2000 — while internal storage tracks x86 within 1.2x, so this is FUSE rather than the phone. Nothing needs deciding up front; real use will show which record types grow into the thousands, likely games and play-log rather than hosts, launchers and presets. The tripwire is a full refresh crossing roughly 100ms, at which point that record type wants a compiled cache on internal storage or an incremental path. This must land before a first full release, because by then the trees are real and a second-long stall on a launch path is a user-visible defect rather than a benchmark.

## Acceptance Criteria

- [ ] Each proseQL record type in real use has a measured full-refresh cost from shared storage
- [ ] Record types whose full refresh exceeds ~100ms are either cached in compiled form on internal storage or given an incremental reload path
- [ ] Hand-editable config (hosts, launchers, presets, settings) still lives in user-visible storage and is still editable by hand
- [ ] The split is documented so a user knows which files they can edit and which are derived

## Related

- `docs/research/watching-config-vs-checking-it.md`
