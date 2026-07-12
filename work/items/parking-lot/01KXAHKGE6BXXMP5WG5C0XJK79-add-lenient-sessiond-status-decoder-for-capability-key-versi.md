---
id: 01KXAHKGE6BXXMP5WG5C0XJK79
slug: add-lenient-sessiond-status-decoder-for-capability-key-versi
title: Add lenient sessiond status decoder for capability-key version skew
origin: parked
status: To Do
priority: medium
labels:
  - protocol
  - sessiond
  - version-skew
created: 2026-07-12
source: se-work
---

# Add lenient sessiond status decoder for capability-key version skew

## Why it matters

The managed-launch protocol strict-decodes SessiondManagedLaunchStatus (onExcessProperty error), so an older client probing a newer daemon rejects the whole status when a new capability key appears (applies to launchFreeze and now launchHooks). Deploys ship client+daemon together, but incident-response/rollback windows run mismatched versions. The protocol file itself suggests the remedy: a lenient parallel decoder for the status polling call site, keeping strict decode everywhere else.

## Acceptance Criteria

- [ ] Status probe path tolerates unknown capability keys from a newer daemon.
- [ ] All other decode call sites keep strict onExcessProperty error posture.
- [ ] Regression test models old-client/new-daemon status probe with an unknown capability key.

## Related

- `product/platform/library/sessiond-managed-launch-protocol.ts`
- `product/platform/library/sessiond-managed-launch-client.ts`
