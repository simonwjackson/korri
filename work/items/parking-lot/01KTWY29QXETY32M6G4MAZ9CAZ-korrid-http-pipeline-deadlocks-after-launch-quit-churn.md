---
id: 01KTWY29QXETY32M6G4MAZ9CAZ
slug: korrid-http-pipeline-deadlocks-after-launch-quit-churn
title: korrid HTTP pipeline deadlocks after launch/quit churn
origin: parked
status: To Do
priority: high
labels:
  - korrid
  - deadlock
  - library
  - resilience
created: 2026-06-12
source: se-debug
---

# korrid HTTP pipeline deadlocks after launch/quit churn

## Why it matters

Twice tonight on bandai (trunk 274eaea-era korrid), shortly after a game launch terminated, korrid stopped answering HTTP entirely — even an empty RPC batch gets no response for 60+ s (curl 000) — while the process stays alive, journald logging continues, and config-graph opens keep being logged. Every request hangs, so the kiosk shows "loading library.." forever; only a korrid restart recovers (and then the portal-UI reconnect bug 01KTWXG8RZ compounds it, requiring a sessiond restart too). Suspect the library list path's per-request graph re-open combined with single-flight rebuild serialization: a lock/await never resolves after the launch-termination path, and all requests queue behind it. Couch users experience this as the device dying after quitting a game.

## Acceptance Criteria

- [ ] Reproduce: launch + quit via inputd shortcut, then hammer app.library.list; korrid must keep answering
- [ ] Identify the held lock/await (rebuild single-flight, controller mutex, or graph open) with evidence
- [ ] Fix lands with a regression test simulating launch-terminate + concurrent list calls
- [ ] Health endpoint responds even while a rebuild is in flight (liveness must not share the wedged path)

## Related

- `product/platform/library/config-graph-controller.ts`
- `product/platform/library/library-source-layer-live.ts`
- `backlog 01KTWXG8RZ90R1D5AX1S1Y9AS4`
