---
id: 01KX6M0HJK6AJCF7JC9XVKAZBH
slug: upgrade-managed-launch-freeze-to-cgroup-v2-systemd-scopes
title: Upgrade managed-launch freeze to cgroup v2/systemd scopes
origin: parked
status: To Do
priority: medium
labels:
  - sessiond
  - freeze-resume
  - reliability
created: 2026-07-10
source: se-work
---

# Upgrade managed-launch freeze to cgroup v2/systemd scopes

## Why it matters

The shipped standard-cycle freeze uses the existing managed launch handle and process-group signals, which is enough for a vertical slice, but research shows cgroup v2/systemd freeze is safer for Proton/Wine/FEX multi-process trees and avoids races where child processes escape a process group.

## Acceptance Criteria

- [ ] Managed game launches run inside a named delegated cgroup or systemd scope.
- [ ] /managed-launch/freeze and /managed-launch/thaw use cgroup.freeze or systemd FreezeUnit/ThawUnit when available.
- [ ] Status waits for cgroup.events frozen=1 before reporting phase=frozen.
- [ ] Tests cover Proton-like child processes that are not direct children but remain inside the delegated cgroup.

## Related

- `product/services/device/sessiond.ts`
- `product/platform/library/shell-launcher.ts`
- `product/platform/library/sessiond-managed-launch-protocol.ts`
