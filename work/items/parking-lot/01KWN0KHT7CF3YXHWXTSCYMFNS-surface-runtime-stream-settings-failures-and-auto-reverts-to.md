---
id: 01KWN0KHT7CF3YXHWXTSCYMFNS
slug: surface-runtime-stream-settings-failures-and-auto-reverts-to
title: Surface runtime stream-settings failures and auto-reverts to the user via an in-session overlay
origin: parked
status: To Do
priority: medium
labels:
  - runtime-settings
  - ux
  - overlay
  - observability
  - follow-up
created: 2026-07-03
source: user
---

# Surface runtime stream-settings failures and auto-reverts to the user via an in-session overlay

## Why it matters

Phase 1 optimizes for continuity: when a live stream-settings change hangs, times out, or leaves a frozen/black screen, the system auto-reverts to the last known-good settings and logs the event durably. But logs are not visible to the player in the moment, so a failure is effectively silent to them. Once Korri has an in-session overlay/notification surface, these events (a change failed, we reverted, and why) should be shown to the user without breaking immersion or disconnecting the stream, so recovery is never silent when the user would want to know.

## Acceptance Criteria

- [ ] When an in-session overlay/notification surface exists, runtime-settings failures and auto-reverts are shown to the user with a plain-language cause.
- [ ] Continuity is preserved: surfacing the message never forces a disconnect or interrupts the stream.
- [ ] The surface reads from existing runtime-settings state/events (last command, applied values, revert reason), not a new protocol.
- [ ] The user can distinguish 'change applied', 'change failed and we reverted', and 'change failed and could not revert'.

## Related

- `docs/acceptance/runtime-settings-protocol-contract.md`
- `work/parking-lot/01KT2T2J1M960ZTBER1XQF3D3N-expose-runtime-stream-state-and-command-results-in-product-u.md`
