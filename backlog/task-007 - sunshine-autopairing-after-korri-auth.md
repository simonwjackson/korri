---
id: task-007
title: Sunshine autopairing once Korri auth exists
status: To Do
priority: medium
labels:
  - sunshine
  - moonlight
  - auth
  - depends-on
created: 2026-05-29
source: user
---

# Sunshine autopairing (after some kind of Korri auth)

## Context

Once Korri has a real identity/auth concept, Sunshine hosts that recognize that identity should auto-pair without manual PIN exchange. The pairing happens once at the auth boundary; Sunshine inherits trust from it.

## Why it matters

Manual PIN pairing per host doesn't scale to multi-host households or multi-user setups. Threading pairing through Korri identity removes a per-host friction step and is the structurally correct place for that trust to live.

## Acceptance Criteria

- [ ] Depends on a real Korri auth/identity mechanism existing first (block until that lands).
- [ ] Sunshine-side integration that exchanges a Korri-issued credential for a paired-client record without an interactive PIN.
- [ ] Falls back cleanly to manual pairing (task-006 GUI flow) when the host doesn't speak the Korri auth handshake.
- [ ] Smoke path: a freshly provisioned Korri device auto-pairs with a known Sunshine host on first connect.

## Related

- `packages/sunshine-korri/`
- `packages/moonlight-embedded-korri/`
- backlog/task-006 - gui-moonlight-pairing.md
- backlog/task-008 - multi-user-support.md

## Notes

Blocked on Korri auth. Don't start until the auth seam is defined; capture this so the design of auth accounts for the pairing use case.
