---
id: task-066
title: Prove seamless runtime resolution scaling on Bandai
status: To Do
priority: medium
labels:
  - runtime-settings
  - moonlight
  - sunshine
  - resolution-scaling
  - hardware-validation
created: 2026-05-31
source: user
---

# Prove seamless runtime resolution scaling on Bandai

## Why it matters

Active resolution scaling could make severe bitrate drops more watchable by reducing pixels-per-second, but unlike bitrate/FPS it crosses Sunshine capture, encoder, stream protocol, Moonlight decoder, renderer buffers, and input-coordinate assumptions. We need same-session client proof before treating Sunshine's applied ack as enough for product adaptation.

## Acceptance Criteria

- [ ] Downscale-only smoke proves 1080p → 720p in the same Moonlight session on Aka → Bandai without reconnect, black frame, frozen stream, or broken input.
- [ ] Upscale smoke proves 720p → 1080p recovery in the same session, or documents the exact failure mode if upscale is unsafe.
- [ ] Resolution mutation forces or otherwise verifies an IDR/keyframe boundary so the client receives clean decoder state after the size change.
- [ ] Moonlight local-control state distinguishes Sunshine-applied from client-proven resolution, with decoded/rendered dimensions observable after the command.
- [ ] Aka Sunshine logs and Bandai Moonlight/control evidence show command request id, applied/proven outcome, stream continuity, and final width/height.

## Related

- `packages/moonlight-embedded-korri/README.md`
- `packages/moonlight-embedded-korri/patches/0005c-add-env-driven-sunshine-runtime-settings-request-hook.patch`
- `packages/moonlight-embedded-korri/patches/0005d-add-spike-gated-sunshine-runtime-settings-adaptation.patch`
- `packages/moonlight-embedded-korri/patches/0007-wire-local-control-runtime-command-events.patch`
- `packages/sunshine-korri/patches/0004-add-proof-gated-runtime-resolution-apply-path.patch`
- `korri/shared/stream/moonlight-control-protocol.ts`

## Notes

Conversation conclusion: confidence is moderate for runtime resolution, lower than bitrate. Start with downscale-only; treat resolution as proof-gated until Bandai's SM8550 v4l2m2m decoder/render path survives same-session size changes. Bitrate/FPS are separate knobs; resolution helps preserve quality at lower bitrate rather than directly reducing bandwidth by itself.
