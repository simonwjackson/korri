---
id: 01KTZQV6SKGJMFM880VYEETW7Z
slug: restore-full-typescript-typecheck
title: Restore full TypeScript typecheck
origin: parked
status: To Do
priority: medium
labels:
  - tech-debt
  - typecheck
created: 2026-06-13
source: se-work
context:
  cwd: /home/simonwjackson/code/sandbox/korri
  branch: trunk
  commit: 974c72e
---

# Restore full TypeScript typecheck

## Why it matters

The launch fix validated with targeted tests, but the repository-wide typecheck is currently red on unrelated Bun/sessiond socket typings and screenshot child stream nullability; leaving it red makes future slices harder to gate cleanly.

## Acceptance Criteria

- [ ] `bun run typecheck` exits 0 from the Korri repo root.
- [ ] Sessiond harness tests use the current socket/token option contracts.
- [ ] Device screenshot child stream handling satisfies strict null checks.

## Related

- `product/apps/portal/features/home/foreground-session-status-layer-live.integration.test.ts`
- `product/platform/library/sessiond-managed-launch-event-observer.test.ts`
- `product/platform/library/sessiond-managed-launch-event-observer.ts`
- `product/services/device/sessiond.ts`
- `tools/device/screenshot.ts`
