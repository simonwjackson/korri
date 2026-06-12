---
id: 01KTWXG8RZ90R1D5AX1S1Y9AS4
slug: portal-ui-never-recovers-from-korrid-restarts-stuck-on-loadi
title: "Portal UI never recovers from korrid restarts (stuck on \"loading library\")"
origin: parked
status: To Do
priority: high
labels:
  - portal
  - resilience
  - ux
created: 2026-06-12
source: se-debug
---

# Portal UI never recovers from korrid restarts (stuck on "loading library")

## Why it matters

Three times today on bandai the kiosk UI sat on "loading library.." indefinitely while korrid answered RPC perfectly — every korrid restart strands the electrobun front-end on a dead connection with no retry/reconnect, requiring a sessiond restart to recover. On an appliance the daemon will restart (crashes, config redeploys, watchdog) and the UI must resync itself; a couch user has no systemctl. Needs reconnect-with-backoff in the portal's RPC client (or sessiond watching korrid restarts and reloading the renderer).

## Acceptance Criteria

- [ ] Restarting korrid.service while the UI is open results in the library reappearing without any manual intervention (within ~10 s)
- [ ] Reconnect behavior covered by a test or documented manual validation on device

## Related

- `product/apps/portal`
- `product/services/device/sessiond-renderer.ts`
