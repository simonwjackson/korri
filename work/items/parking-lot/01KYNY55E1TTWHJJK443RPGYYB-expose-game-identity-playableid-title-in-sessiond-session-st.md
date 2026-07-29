---
id: 01KYNY55E1TTWHJJK443RPGYYB
slug: expose-game-identity-playableid-title-in-sessiond-session-st
title: Expose game identity (playableId/title) in sessiond session status
origin: parked
status: To Do
priority: medium
labels:
  - sessiond
  - rpc
  - android-shell
created: 2026-07-29
source: user
---

# Expose game identity (playableId/title) in sessiond session status

## Why it matters

app.session.status returns only {launchId, mode, phase}; the launched game's identity is known at prepare time but dropped, so no client can name an active/frozen session it didn't launch itself. The Android Korri shell spike works around this with localStorage, which fails for cross-client visibility (e.g. frozen Skate 3 session shows as 'A game is running on the source'). providerLifecycle's appId is observer state, not session state, and can be stale/wrong.

## Acceptance Criteria

- [ ] SessionActive in app.session.status includes optional playableId and title fields
- [ ] Prepare/launch path threads playable identity into the sessiond launch record
- [ ] Protocol evolution follows the documented optional-field-first rule in sessiond-managed-launch-protocol.ts (client schema ships before daemon emits)
- [ ] A session launched by one client shows its game title when queried by another client

## Related

- `product/apps/portal/api/session/status.rpc.ts`
- `product/platform/library/sessiond-managed-launch-protocol.ts`
- `product/apps/portal/api/server/prepare.rpc.ts`
