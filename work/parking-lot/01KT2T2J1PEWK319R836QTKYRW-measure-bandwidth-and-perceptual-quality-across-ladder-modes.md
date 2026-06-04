---
id: 01KT2T2J1PEWK319R836QTKYRW
slug: measure-bandwidth-and-perceptual-quality-across-ladder-modes
title: Measure bandwidth and perceptual quality across ladder modes
origin: parked
legacy: task-093
status: To Do
priority: medium
labels:
  - streaming
  - performance
  - quality
  - bandwidth
created: 2026-06-02
source: user
---

# Measure bandwidth and perceptual quality across ladder modes

## Why it matters

The feature goal is adaptive streaming quality. We need data that pairs network savings with acceptable visual quality rather than relying on subjective one-off impressions.

## Acceptance Criteria

- [ ] Collect bandai wlan0 RX Mbps for 1080p, 576p, and 360p at multiple bitrate targets during game motion.
- [ ] Capture representative DSI-2 screenshots or short clips for each mode.
- [ ] Summarize which mode/bitrate combinations are demo-worthy and which are unacceptable.
- [ ] Use results to tune the default quality ladder.

## Related

- `docs/acceptance/runtime-settings-protocol-contract.md`
- `tools/cli/moonlight-runtime-watch.ts`
- `tools/scripts/live-runtime-resolution-gate.sh`

## Notes

Known measurements: 1080p normal ~12 Mbps; 1024x576 same bitrate ~12 Mbps; 1024x576 + 4000 kbps ~6 Mbps. User observed 1 Mbps @ 360p looked much less pixelated during high movement than 1 Mbps @ 1080p.
