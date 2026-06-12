---
id: 01KTWBYR0Y8SA5ZF20Q2572D3P
slug: reap-lingering-emulator-processes-on-launch-failure
title: Reap lingering emulator processes on launch failure
origin: parked
status: To Do
priority: high
labels:
  - sessiond
  - launch
  - resilience
created: 2026-06-11
source: se-debug
---

# Reap lingering emulator processes on launch failure

## Why it matters

Failed Ryujinx launches ignore SIGTERM mid-init and linger holding 600 MB+ shmem each; three accumulated on bandai until the guest memcg cap made every subsequent launch fail. The sessiond-managed launch path must guarantee teardown — kill the whole transient unit/process group on failure and on next-launch preflight, so one bad launch cannot poison the rest of the session.

## Acceptance Criteria

- [ ] A launch that exits nonzero leaves zero emulator processes (verified via pgrep in a test)
- [ ] Next launch preflight kills stragglers from prior managed launches
- [ ] OOM/SIGKILL of the child is reported distinctly from a config failure in the LaunchFailed response

## Related

- `product/services/device/sessiond.ts`
- `product/platform/library/shell-launcher.ts`
