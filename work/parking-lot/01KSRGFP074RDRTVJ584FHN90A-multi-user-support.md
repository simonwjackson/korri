---
id: 01KSRGFP074RDRTVJ584FHN90A
slug: multi-user-support
title: "Multi-user support across device, library, and sessions"
origin: parked
legacy: task-008
status: To Do
priority: medium
labels:
  - multi-user
  - architecture
  - library
  - sessiond
created: 2026-05-29
source: user
---

# Multi users

## Context

Korri currently assumes a single implicit user on the device. Add a real multi-user model: per-user identity, per-user library/save state, per-user sessions, and per-user paired hosts.

## Why it matters

Multi-user is a structural shape — once two real users share a device, every assumption about "the" library, "the" session, "the" save state, and "the" paired host has to be revisited. Designing it deliberately is much cheaper than retrofitting later, and it unblocks task-007 (Sunshine autopairing tied to a Korri identity) and task-009 (savestate sync per user).

## Acceptance Criteria

- [ ] Identity model documented in `docs/solutions/` (what is a user, how is one created, switched, removed).
- [ ] Library, session, and save-state surfaces are scoped to a user (no implicit global state).
- [ ] Portal UI for user selection / switching.
- [ ] Live-USB VM smoke covers at least two users without state bleed.

## Related

- ./01KSRGFP03RFZQGFSS6FJ1FCTJ-stop-running-as-root.md
- ./01KSRGFP06N8W8F0EM7Q25C9H9-sunshine-autopairing-after-korri-auth.md
- ./01KSRGFP08VSZ99ZD7MZC8QBCW-sessiond-100-percent-test-coverage - steam-like-savestate-sync.md
- `korri/shared/library/`

## Notes

Large; promote to `se-plan` before execution. Pair with task-004 (non-root user model) so the OS-user story and the Korri-user story are designed together.
