---
id: task-083
title: Consolidate runtime-resolution Sunshine patches
status: To Do
priority: high
labels:
  - streaming
  - cleanup
  - runtime-resolution
  - sunshine
created: 2026-06-02
source: user
---

# Consolidate runtime-resolution Sunshine patches

## Why it matters

The final Sunshine behavior is split across several incremental debugging patches, which makes the implementation hard to review and increases the chance that a future edit removes one half of the working generation-boundary fix.

## Acceptance Criteria

- [ ] Patch stack has one coherent production patch for runtime resolution or clearly named production patches with no diagnostic-only comments.
- [ ] Runtime config persistence, direct async capture reinit, and skip-flush teardown semantics are documented in code comments as one lifecycle.
- [ ] No stale switch_display-based reinit code remains if direct runtime_reinit_event is the actual mechanism.
- [ ] Build succeeds and bandai physical validation passes for downshift and upshift.

## Related

- `packages/sunshine-korri/patches/0012-persist-runtime-config-and-reinit-capture-after-resolution.patch`
- `packages/sunshine-korri/patches/0013-request-async-capture-reinit-after-runtime-resolution.patch`
- `packages/sunshine-korri/patches/0014-skip-runtime-vaapi-destructor-flush.patch`
- `packages/sunshine-korri/package.nix`

## Notes

Final production mechanism should read as: new encoder config is persisted, capture thread gets a dedicated runtime reinit signal, encoder loop recreates cleanly, runtime-replaced VAAPI sessions skip destructor drain that crashes in FFmpeg VAAPI teardown.
