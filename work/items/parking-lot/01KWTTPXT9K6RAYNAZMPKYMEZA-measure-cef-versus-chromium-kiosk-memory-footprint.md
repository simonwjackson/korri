---
id: 01KWTTPXT9K6RAYNAZMPKYMEZA
slug: measure-cef-versus-chromium-kiosk-memory-footprint
title: Measure CEF versus Chromium kiosk memory footprint
origin: parked
status: To Do
priority: medium
labels:
  - renderer
  - chromium
  - cef
  - performance
  - follow-up
created: 2026-07-06
source: user
context:
  cwd: .
  branch: trunk
  repo: simonwjackson/korri
  invoked_by: se-backlog
---

# Measure CEF versus Chromium kiosk memory footprint

## Why it matters

Renderer choice affects handheld memory headroom, disk closure size, and kiosk stability. Current guidance assumes standalone Chromium is acceptable, but a measured PSS/closure comparison would make future CEF or custom-renderer decisions evidence-based instead of speculative.

## Acceptance Criteria

- [ ] Measure current standalone Chromium kiosk process-tree PSS/RSS and Nix closure size on a target device.
- [ ] Measure a comparable CEF or Electrobun-CEF prototype under the same UI, device, and workload conditions, or document why a fair prototype is not available.
- [ ] Compare runtime process model, GPU acceleration status, startup behavior, and kiosk-lockdown implications.
- [ ] Record a recommendation: keep standalone Chromium, revisit CEF, or reject CEF with evidence.

## Related

- `product/services/device/nix/chromium-kiosk.nix`
- `product/services/device/sessiond-chromium.ts`
- `work/items/active/01KWE3F5Q2ZK8N4YT7VBQ3MJ9A-replace-electrobun-chromium-kiosk/plan.md`

## Notes

Prompted by discussion of whether CEF would have a meaningfully smaller memory footprint than the current standalone Chromium kiosk. Compare PSS rather than only RSS because Chromium/CEF process trees share mappings.
