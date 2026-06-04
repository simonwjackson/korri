---
id: 01KT2T2J248VP8QNX3JW0T1AB7
slug: build-bandai-gamescope-control-acceptance-harness
title: Build Bandai Gamescope control acceptance harness
origin: parked
legacy: task-109
status: To Do
priority: high
labels:
  - gamescope
  - bandai
  - acceptance
  - hardware-validation
  - runtime-control
created: 2026-06-02
source: user
---

# Build Bandai Gamescope control acceptance harness

## Why it matters

Physical DSI-2 validation is the source of truth for Gamescope scaling and live mode behavior; a repeatable harness keeps the v1 proofs reproducible instead of depending on ad-hoc SSH command history.

## Acceptance Criteria

- [ ] Script starting Gamescope with the native-redraw probe, starting the bridge, running API commands, and collecting state/readback logs.
- [ ] Capture DSI-2 images for mode swaps, FSR enable/disable, and sharpness changes while preserving process liveness checks.
- [ ] Record acceptance notes and command outputs in docs or logs, while keeping generated images out of normal commits unless explicitly archived.
- [ ] Cover the sequence 640x360 -> 960x540 -> 1280x720 -> 640x360 and linear -> fsr -> linear with FSR feedback readback.

## Related

- `tools/cli/gamescope-control.ts`
- `tools/cli/gamescope-control-bridge.ts`
- `korri/shared/gamescope-control`
- `packages/gamescope-korri`
- `./01KT2T2J1XPWAQTG8N5KRVC7HA-spike-gamescope-live-fsr-and-inner-resolution-changes.md`
- `./01KT2T2J1JPMTQ0374QPEDJ48S-validate-gamescope-fsr-with-reliable-evidence.md`
- `./01KT2T2J1YK1SN1ZK0B8W0KBXJ-build-full-gamescope-rpc-control-api.md`

## Notes

PR phase 5. This formalizes the Bandai native-redraw and DSI-2 validation already performed manually.
