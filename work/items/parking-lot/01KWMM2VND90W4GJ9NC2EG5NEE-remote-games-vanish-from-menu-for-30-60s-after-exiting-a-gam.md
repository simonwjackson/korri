---
id: 01KWMM2VND90W4GJ9NC2EG5NEE
slug: remote-games-vanish-from-menu-for-30-60s-after-exiting-a-gam
title: Remote games vanish from menu for 30-60s after exiting a game
origin: parked
status: To Do
priority: medium
labels:
  - korri
  - catalog
  - federation
  - gui
  - streaming
  - responsiveness
created: 2026-07-03
source: user
---

# Remote games vanish from menu for 30-60s after exiting a game

## Why it matters

Concrete, repeatable UX regression on the handheld: after exiting a streamed game, the remote (federated) games disappear from the menu for ~30-60 seconds, then reappear on their own. This makes the couch experience feel broken right at the moment you'd want to pick your next game. Strong hypothesis: the handheld fetches the remote catalog on a ~30-60s timer; game-exit churn makes the source briefly report not-ready, and instead of holding the last-known list the handheld drops the remote entries until the next timed refresh. Fixing this is what makes the menu feel responsive rather than stale. Supersedes the earlier vague 'verify GUI shows federated entries' item by pinning the actual observed failure.

## Acceptance Criteria

- [ ] Reproduce and confirm the ~30-60s blanking window and its trigger (game exit / source momentarily not-ready)
- [ ] Catalog refresh is event-driven on game exit / state-settle, not only on a fixed timer
- [ ] A brief source hiccup or failed refresh no longer blanks already-known remote entries (last-known list is retained)
- [ ] After exiting a streamed game, remote games remain visible/selectable within a couple seconds
- [ ] Confirm relationship to existing catalog-refresh items (peer refresh service / throttling) and dedupe if overlapping

## Related

- `work/items/parking-lot/01KWGPS8CVJ5RX4H69JKCPVFP3-verify-bandai-gui-launches-newly-federated-aka-entries-stale.md`
- `01KV0TZAVD2KVDXZKV7J4BMX9C`
- `01KV142WAKP13496XHF3TXJNJK`
- `01KTWXG8RZ90R1D5AX1S1Y9AS4`
- `product/apps/portal/stream`

## Notes

User observation: 'especially after exiting a game, the remote games will just be gone for maybe a good 30 to 60 seconds and then usually they show back up.' Wants a more responsive system. Likely related backlog: 01KV0TZAVD (scoped discovery-driven peer refresh), 01KV142WAK (throttle repeated peer refresh failures), 01KTWXG8RZ (portal UI never recovers from korrid restarts). Two-part fix framing: (1) refresh immediately on game exit, (2) retain last-known entries through transient not-ready/refresh failures instead of dropping them.
