---
id: 01KT2T2J1CB16BGMV4RSV8VC4S
slug: prune-obsolete-live-resolution-diagnostic-patches
title: Prune obsolete live-resolution diagnostic patches
origin: parked
legacy: task-082
status: To Do
priority: high
labels:
  - streaming
  - cleanup
  - runtime-resolution
created: 2026-06-02
source: user
---

# Prune obsolete live-resolution diagnostic patches

## Why it matters

The working stream-resolution path is now known, but the Sunshine/Moonlight patch stack still contains failed diagnostics and verbose instrumentation that add risk, overhead, and confusion if shipped as-is.

## Acceptance Criteria

- [ ] Sunshine package no longer applies failed diagnostics such as VAAPI sequence logging, GL finish, packet hash logging, forced source copy, and crashy target-surface rotation.
- [ ] Moonlight package no longer applies frame-content hash diagnostics unless explicitly gated for debug builds.
- [ ] A clean build confirms the remaining patch stack still compiles.
- [ ] A bandai physical gate still passes 1080p -> 360p/576p -> 1080p after pruning.

## Related

- `packages/sunshine-korri/package.nix`
- `packages/sunshine-korri/patches/0006-diagnose-vaapi-convert-sequence.patch`
- `packages/sunshine-korri/patches/0007-finish-vaapi-gl-convert-before-encode.patch`
- `packages/sunshine-korri/patches/0008-rotate-vaapi-target-surface-after-runtime-resolution.patch`
- `packages/sunshine-korri/patches/0009-diagnose-avcodec-packet-content-after-resolution.patch`
- `packages/sunshine-korri/patches/0011-force-vaapi-vram-source-copy-before-convert.patch`
- `packages/moonlight-embedded-korri/patches/0012-diagnose-v4l2m2m-frame-content-hash.patch`

## Notes

Working mechanism appears to be runtime config persistence + direct async capture reinit + skip unsafe VAAPI destructor flush, plus Moonlight decoder/presenter reset. Revalidate physically on bandai after every removal.
