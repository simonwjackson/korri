---
id: 01KWNCZQKRG1BKCCC7EWJ6AHT5
slug: finish-moonlight-plugin-residuals-u10-stream-control-surface
title: "Finish Moonlight-plugin residuals: U10 stream-control surface + Nix build verify"
origin: parked
status: To Do
priority: medium
labels:
  - moonlight-plugin
  - stream-control
  - nix
  - follow-up
created: 2026-07-04
source: se-work
context:
  branch: refactor/moonlight-plugin
  repo: korri
  invoked_by: se-work
---

# Finish Moonlight-plugin residuals: U10 stream-control surface + Nix build verify

## Why it matters

The Moonlight removable-plugin extraction is complete and green, but two scoped follow-ups remain. (1) U10 was intentionally deferred: the stream-control service still exposes the dedicated set-moonlight-* RPC endpoints and fixed `moonlight` schema keys (platform-owned, no plugin import, so removability holds) — genericizing them onto the plugin's stream-control.apply/describe path and moving the evier web UI to the generic action is a cleanliness follow-up. (2) U8's Nix package move + image enablement (@korri:moonlight) is path-correct and TS-green but was NOT build-verified in the dev sandbox; it needs `just test-nix` / an image build on CI or hardware before merge, plus a real streaming smoke to confirm the plugin-enabled streamer works end-to-end.

## Acceptance Criteria

- [ ] set-moonlight-* endpoints removed; Moonlight controls flow through stream-control.apply/describe; evier UI uses the generic action
- [ ] just test-nix (or image build) passes with the relocated package and @korri:moonlight enabled
- [ ] a real device streaming smoke confirms launch + bitrate/fps/resolution control work with Moonlight as an enabled plugin

## Related

- `work/items/active/01KWN49HEG9X0HFJBMK2KRJ8CM-moonlight-streaming-plugin/plan.md`
- `product/apps/portal/api/stream-control/service.ts`
- `product/plugins/moonlight/packages/moonlight-embedded-korri`
