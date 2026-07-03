---
id: 01KWJF5YGMFEGB634NNQGQST5V
slug: harden-korrid-status-against-torn-nul-padded-game-stream-sta
title: Harden korrid status against torn/NUL-padded game-stream status.json
origin: parked
status: To Do
priority: low
labels:
  - korri
  - status
  - streaming
  - robustness
  - source-machine
created: 2026-07-02
source: se-debug
---

# Harden korrid status against torn/NUL-padded game-stream status.json

## Why it matters

While an aka stream session was active, app.server.status failed with 'JSON Parse error: Unrecognized token \u0000' and only recovered once the session stopped and status.json was rewritten to idle. The game-stream status.json write leaves trailing NUL padding (torn/fixed-size overwrite) that korrid's status aggregation reads and fails to parse, so aka reports unavailable to the GUI/federation during active sessions even though the launch path works. Should trim trailing NULs / tolerate partial writes (or write atomically via rename) so status stays readable while a game runs.

## Acceptance Criteria

- [ ] app.server.status succeeds while a game-stream session is running on a source machine
- [ ] game-stream status.json writes are atomic or the reader tolerates trailing NUL/partial content
- [ ] aka does not flip to unavailable in the federated catalog during active sessions

## Related

- `product/services/device/game-stream-launch-intent.ts`
- `product/apps/portal/api/stream`
- `product/services/device/game-stream-fullscreen.ts`
