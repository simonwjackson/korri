---
id: task-006
title: GUI Moonlight pairing flow in the portal
status: To Do
priority: medium
labels:
  - moonlight
  - portal
  - ui
created: 2026-05-29
source: user
---

# GUI Moonlight pairing

## Context

Moonlight pairing is currently a manual/CLI flow. Surface pairing as a first-class UI in the portal: discover hosts, initiate pair, display the PIN, show success/error states, and persist the paired host.

## Why it matters

Pairing is the entry point to streaming. As long as it requires shelling in, Moonlight isn't a real product feature for non-developer users. A GUI pairing flow unblocks the streaming experience for everyone but the developer.

## Acceptance Criteria

- [ ] Portal route/component for "Pair a host" with discovery, PIN display, and result states (`Pairing`, `PairFailed`, `Paired`).
- [ ] Effect RPC contract for the pairing operations (Schema-first, typed errors discriminated on `_tag`).
- [ ] Storybook coverage for each pairing state.
- [ ] Smoke path that pairs against a real host succeeds end-to-end.

## Related

- `packages/moonlight-embedded-korri/`
- `korri/products/app/`
- `korri/shared/stream/`
- `docs/plans/2026-05-26-003-feat-moonlight-local-control-protocol-plan.md`

## Notes

Should follow the Effect Runtime + React state-modeling conventions (state ADT + self-selecting state components). Likely deserves an `se-plan` before execution.
