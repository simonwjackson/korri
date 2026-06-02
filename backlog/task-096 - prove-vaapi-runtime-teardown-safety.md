---
id: task-096
title: Prove VAAPI runtime teardown safety
status: To Do
priority: high
labels:
  - live-resolution
  - vaapi
  - safety
  - upstream
created: 2026-06-02
source: user
---

# Prove VAAPI runtime teardown safety

## Why it matters

The working fix skips destructor flushing for runtime-replaced VAAPI sessions to avoid a crash. That is a delicate lifetime/FFmpeg contract change; upstream or shipping needs proof that it does not leak surfaces, drop required packets, or mask a deeper cleanup bug.

## Acceptance Criteria

- [ ] A targeted note documents why destructor flush crashes after runtime replacement
- [ ] Alternative teardown strategies are evaluated: explicit pre-drain, async teardown, skip-drain, and packet drop
- [ ] No Sunshine crash occurs across long 1080p/576p/360p cycling soak
- [ ] Resource usage is checked for leaks across at least 100 resolution cycles
- [ ] The final implementation has a narrow condition for skip-drain rather than globally disabling flush

## Related

- `packages/sunshine-korri/patches/0014-skip-runtime-vaapi-destructor-flush.patch`
- `task-083`
- `task-088`
- `task-094`
