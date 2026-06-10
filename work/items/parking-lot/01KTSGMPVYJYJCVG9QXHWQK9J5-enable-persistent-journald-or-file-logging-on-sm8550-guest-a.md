---
id: 01KTSGMPVYJYJCVG9QXHWQK9J5
slug: enable-persistent-journald-or-file-logging-on-sm8550-guest-a
title: Enable persistent journald (or file logging) on SM8550 guest and host
origin: parked
status: To Do
priority: medium
labels:
  - rocknix-sm8550
  - observability
created: 2026-06-10
source: se-debug
context:
  branch: trunk
  repo: korri
  invoked_by: bandai sleep-health investigation 2026-06-10
---

# Enable persistent journald (or file logging) on SM8550 guest and host

## Why it matters

Three debugging rounds today lost all evidence to volatile journals and /run logs across reboots; each loss cost a full reproduce cycle with physical intervention. Persistent journald on the guest (and ideally the ROCKNIX host) would make device incidents diagnosable after the power-cycle that recovers them.

## Acceptance Criteria

- [ ] journalctl --list-boots on the guest shows prior boots
- [ ] Incident logs survive a hard power-cycle
