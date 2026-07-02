---
id: 01KWGPS8CVJ5RX4H69JKCPVFP3
slug: verify-bandai-gui-launches-newly-federated-aka-catalog-entri
title: Verify Bandai GUI launches newly-federated aka catalog entries (stale-catalog check)
origin: parked
status: To Do
priority: medium
labels:
  - korri
  - gui
  - catalog
  - federation
  - streaming
created: 2026-07-02
source: se-debug
---

# Verify Bandai GUI launches newly-federated aka catalog entries (stale-catalog check)

## Why it matters

The first GUI tap of the new gba-anguna entry produced no launch. The backend now accepts it (absolute-command override in place), but it is unverified whether Bandai's Chromium hub actually shows and launches newly-federated aka entries live, or whether the GUI renders a cached/stale catalog that predates the entry (Bandai status also reports catalog: unavailable with recurring sobo federation timeouts). Need to confirm the GUI->launch path end-to-end for a freshly-added remote entry.

## Acceptance Criteria

- [ ] Tapping a newly-added aka catalog entry in Bandai's GUI dispatches app.library.launch and streams
- [ ] Bandai GUI catalog reflects federated aka changes without a manual korrid restart
- [ ] Confirm whether catalog: unavailable / sobo federation timeouts degrade the GUI's launchable list

## Related

- `product/apps/portal/stream/remote-stream-client.ts`
- `product/surfaces/web/shift`
- `01KTWXG8RZ90R1D5AX1S1Y9AS4`
- `01KV142WAKP13496XHF3TXJNJK`
