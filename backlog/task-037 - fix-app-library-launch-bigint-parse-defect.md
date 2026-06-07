---
id: task-037
title: Fix app.library.launch BigInt parse defect
status: To Do
priority: high
labels:
  - bug
  - library
  - launch
  - proseql
  - rpc
created: 2026-06-07
source: user
---

# Fix app.library.launch BigInt parse defect

## Why it matters

Some UI launches fail before spawning anything with an Effect Defect `SyntaxError: Failed to parse String to BigInt`. Because it is data-dependent and pre-dates the RG353M gamescope work, it can masquerade as device/runtime launch failure while actually coming from Korri's library/ProseQL launch path. Korri should validate or stop producing the bad value and return a graceful launch error instead of crashing the Effect fiber.

## Acceptance Criteria

- [ ] A reproducible failing test covers `app.library.launch` with the problematic non-integer/id/library state that currently triggers `Failed to parse String to BigInt`.
- [ ] The launch path no longer throws an Effect Defect for this case; it returns a typed/graceful RPC error with enough context to diagnose the bad library value.
- [ ] The source of the non-integer BigInt input is either corrected at production time or rejected at the boundary before reaching the ProseQL/dependency BigInt parser.
- [ ] Known-good library launches continue to spawn normally.

## Related

- `product/apps/portal/api/library/launch.rpc-handler.ts`
- `product/platform/library/proseql/library-repository.ts`
- `product/platform/library/library-services.ts`
- `nix-on-rocks:backlog/task-029`
- `/tmp/handoff-wTpPGY.md`

## Notes

Handoff repro: POST to korri-server :3001/api/rpc with {"_tag":"Request","id":"x","tag":"app.library.launch","payload":{"id":"<game-id>"}}. It is data-dependent: some games work, some ids/library state hit `SyntaxError: Failed to parse String to BigInt`. Recommended next skill: se-debug.
