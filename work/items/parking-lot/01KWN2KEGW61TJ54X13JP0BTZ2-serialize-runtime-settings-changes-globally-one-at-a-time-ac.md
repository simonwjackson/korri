---
id: 01KWN2KEGW61TJ54X13JP0BTZ2
slug: serialize-runtime-settings-changes-globally-one-at-a-time-ac
title: Serialize runtime settings changes globally (one-at-a-time across families)
origin: parked
status: To Do
priority: medium
labels:
  - runtime-settings
  - moonlight
  - concurrency
  - safety
  - task-092
  - patch-workflow
created: 2026-07-03
source: se-work
---

# Serialize runtime settings changes globally (one-at-a-time across families)

## Why it matters

The runtime-settings protocol contract mandates a single global mutation queue: only one bitrate/FPS/resolution change in flight at a time, so a bitrate change cannot race a resolution encoder rebuild. Today the in-flight latch is per-family (runtime_settings_mvp_has_inflight_family_locked only blocks the same family) plus a 250ms min-interval. Making it global is a small native change, but it must not deadlock the operation-0 capability query (which also passes through the sent path), so it needs the patch-export workflow plus device validation of startup capability learning. Until then, the per-family latch + min-interval protect the common case.

## Acceptance Criteria

- [ ] A new mutation is rejected with conflict (or queued) while any mutation of any family is in flight.
- [ ] Operation-0 capability queries are not blocked/deadlocked by the global latch during startup learning (device-validated).
- [ ] Nix invariant + a client/socket test cover cross-family conflict.
- [ ] moonlight-embedded-korri builds via the control-protocol patch check.

## Related

- `product/vendor/moonlight-embedded-korri/patches/0005b-track-sunshine-runtime-settings-command-outcomes.patch`
- `docs/acceptance/runtime-settings-protocol-contract.md`
