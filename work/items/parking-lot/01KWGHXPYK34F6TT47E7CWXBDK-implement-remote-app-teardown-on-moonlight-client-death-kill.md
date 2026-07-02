---
id: 01KWGHXPYK34F6TT47E7CWXBDK
slug: implement-remote-app-teardown-on-moonlight-client-death-kill
title: Implement remote app teardown on Moonlight client death (kill-chord)
origin: parked
status: To Do
priority: high
labels:
  - korri
  - moonlight
  - kill-chord
  - session-lifecycle
  - federation
created: 2026-07-02
source: user
---

# Implement remote app teardown on Moonlight client death (kill-chord)

## Why it matters

When the Bandai Moonlight client dies (crash or kill-chord), the aka source-side app keeps running (observed orphaned Neverball and Stella sessions that had to be stopped manually via app.session.stop). For the appliance UX, ending a stream — especially via the kill chord — must also terminate the remote app on the source machine. Today local kill-chord plumbing (inputd-actions -> sessiond terminate) only covers local launches; the remote-source path has no verified teardown signal to the peer.

## Acceptance Criteria

- [ ] Killing/stopping the Moonlight client on the requesting host stops the source-side app on the peer
- [ ] Kill chord on the client triggers remote teardown, not just local process kill
- [ ] After client death, peer app.server.status returns runner/sessiond idle without manual app.session.stop

## Related

- `product/services/device/inputd-actions.ts`
- `product/apps/portal/api/library/launch.rpc-handler.ts`
- `product/apps/portal/stream/remote-stream-client.ts`
- `product/apps/portal/stream/moonlight-launcher.ts`
