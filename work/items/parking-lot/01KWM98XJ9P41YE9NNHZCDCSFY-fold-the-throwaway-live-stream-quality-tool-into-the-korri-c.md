---
id: 01KWM98XJ9P41YE9NNHZCDCSFY
slug: fold-the-throwaway-live-stream-quality-tool-into-the-korri-c
title: Fold the throwaway live stream-quality tool into the KORRI CLI
origin: parked
status: To Do
priority: medium
labels:
  - runtime-settings
  - cli
  - productization
  - streaming
created: 2026-07-03
source: user
---

# Fold the throwaway live stream-quality tool into the KORRI CLI

## Why it matters

Phase 1 builds a throwaway laptop command to change bitrate/FPS/resolution on a running stream and read back what applied. The user wants this as a first-class KORRI CLI command once the throwaway proves the flow. Building the guts as a small reusable piece now keeps productization to wrapper work later instead of a rewrite.

## Acceptance Criteria

- [ ] Live stream-quality change (bitrate/FPS/resolution) is available as a KORRI CLI command
- [ ] Reuses the existing stream control client rather than a parallel implementation
- [ ] Reads back and reports the device's actually-applied values, not just command acceptance

## Related

- `product/platform/stream/moonlight-control-client.ts`
- `product/apps/portal/api/stream-control/service.ts`

## Notes

Follow-up to the Phase 1 throwaway tool. Device setting to enable: moonlight.control.enable=true and authority=controller. Socket lives at $XDG_RUNTIME_DIR/korri-moonlight/<sessionId>/control.sock on the device.
