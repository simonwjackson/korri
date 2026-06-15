---
id: 01KV3H6R59FP4ZE0BXXQYVVCKF
slug: spike-rust-session-and-launch-supervisor-backend
title: Spike Rust session and launch supervisor backend
origin: parked
status: To Do
priority: medium
labels:
  - rust
  - sessiond
  - launch
  - memory
  - architecture
  - spike
created: 2026-06-14
source: user
context:
  cwd: .
  branch: trunk
  commit: 81aecc9
  repo: simonwjackson/korri
  invoked_by: se-backlog
---

# Spike Rust session and launch supervisor backend

## Why it matters

WebKit/Electrobun dominates memory, but moving long-lived session, launch, input, and process-supervision responsibilities into a native daemon could lower baseline backend memory, make the portal renderer more safely ephemeral during gameplay, and clarify whether Rust is worth introducing without sacrificing the TS/React authoring model or Effect RPC boundary.

## Acceptance Criteria

- [ ] Define the smallest Rust daemon slice that preserves Effect RPC at the TS product API boundary, likely behind a thin Bun/TS adapter rather than replacing frontend-facing RPC.
- [ ] Prototype one end-to-end session/launch path that can start, report status, stop, and reap a foreground process tree through a stable local IPC/API contract.
- [ ] Compare idle RSS/PSS, startup time, launch/stop latency, binary/package size, and operational complexity against the current Bun/TS sessiond path on a representative device.
- [ ] Document how shared contracts are preserved or generated, including where TypeScript types remain authoritative and where Rust structs are derived or adapted.
- [ ] Decide whether to continue, stop, or narrow the Rust backend direction based on measured memory savings and lifecycle simplicity rather than language preference.

## Related

- `product/services/device/sessiond.ts`
- `product/services/device/sessiond-renderer.ts`
- `product/services/device/inputd-actions.ts`
- `product/platform/library/session-launcher.ts`
- `work/items/parking-lot/01KV3A5RNCMMGR8FY5Y8MKPWGD-normalize-all-foreground-launches-under-one-lifecycle-superv.md`

## Notes

Captured after discussion that RPC is non-negotiable and the likely shape is TS/Effect RPC at the product boundary with Rust behind it for native lifecycle supervision. Keep the spike focused on session/launch/process lifecycle, not a wholesale Bun/TS app rewrite.
