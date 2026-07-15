---
id: 01KXH3MKC9E5YWV6T7XEX5EJR7
slug: mu-13-decide-and-model-per-user-library-federation-entrysour
title: "MU-13: Decide and model per-user library federation (EntrySource userId)"
origin: parked
status: To Do
priority: low
labels:
  - multi-user
  - federation
  - deferred
  - decision
created: 2026-07-14
source: user
---

# MU-13: Decide and model per-user library federation (EntrySource userId)

## Why it matters

Federation is machine-scoped: EntrySource carries hostId but never which user on the remote machine owns an entry. Whether per-user federation is in scope is an open decision; if it is, EntrySource needs a userId dimension. Captured to force an explicit decision rather than silent single-owner assumption.

## Acceptance Criteria

- [ ] Decision recorded: is per-user library federation in scope?
- [ ] If yes, EntrySource gains a userId dimension and remote launch routing threads it
- [ ] If no, the single-owner-per-host assumption is documented explicitly

## Related

- `product/platform/api/rpc/entry-source.ts`
