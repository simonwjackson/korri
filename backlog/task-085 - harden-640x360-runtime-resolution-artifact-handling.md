---
id: task-085
title: Harden 640x360 runtime-resolution artifact handling
status: To Do
priority: high
labels:
  - streaming
  - bug
  - runtime-resolution
  - moonlight
created: 2026-06-02
source: user
---

# Harden 640x360 runtime-resolution artifact handling

## Why it matters

640x360 is valuable for low-bandwidth mode and looked clean in later tests, but it previously produced a green-screen artifact. The demo is weaker until the low-resolution ladder is repeatable.

## Acceptance Criteria

- [ ] Reproduce or rule out the intermittent 640x360 green-screen artifact with repeated 1080p <-> 360p switches.
- [ ] Capture bandai DSI-2 frames and Moonlight/Sunshine logs for each run.
- [ ] Identify whether the root cause is coded-height padding, crop metadata, decoder visible-size handling, or encoder surface alignment.
- [ ] Fix or explicitly block unsafe low resolutions in the runtime-resolution ladder.

## Related

- `packages/moonlight-embedded-korri/patches/0009-reopen-v4l2m2m-decoder-on-output-size-change.patch`
- `packages/moonlight-embedded-korri/patches/0010-reopen-v4l2m2m-context-on-output-size-change.patch`
- `packages/moonlight-embedded-korri/patches/0011-reset-sdl-presenter-on-output-size-change.patch`
- `packages/sunshine-korri/patches/0012-persist-runtime-config-and-reinit-capture-after-resolution.patch`

## Notes

Known clean later run: 640x360 at 1 Mbps with bandai RMSE ~0.10–0.11 and no green mean color. Earlier run showed green screen; do not claim full ladder until this is soaked.
