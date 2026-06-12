---
id: 01KTWFP9B8KTGJ38DYZHM0M2XJ
slug: guard-sessiond-renderer-against-double-spawning-the-desktop-
title: Guard sessiond renderer against double-spawning the desktop UI
origin: parked
status: To Do
priority: medium
labels:
  - sessiond
  - renderer
  - race
created: 2026-06-11
source: se-debug
---

# Guard sessiond renderer against double-spawning the desktop UI

## Why it matters

After a sessiond restart on bandai (2026-06-11), one sessiond instance spawned two complete korri-desktop/electrobun trees one second apart (pids 2649/2700, both parented to the same sessiond), each with its own WebKit processes — ~450 MB of duplicate UI and two windows fighting over the kiosk. A subsequent clean restart spawned exactly one, so it is a startup race (likely renderer respawn-on-failure double-firing during teardown overlap). sessiond should enforce single-instance semantics for its managed renderer: spawn-once latch or kill-before-spawn.

## Acceptance Criteria

- [ ] sessiond restart under churn produces exactly one desktop renderer (loop-test restart x10)
- [ ] Renderer spawn path has an explicit single-instance guard with a log line when a duplicate spawn is suppressed

## Related

- `product/services/device/sessiond-renderer.ts`
- `product/services/device/sessiond.ts`
- `backlog 01KTWBYR0Y8SA5ZF20Q2572D3P`
