---
id: 01KYWWRS94PRXZJD2S9BFS99AQ
slug: ask-zao-whether-a-stream-is-live-so-overlay-on-stream-can-be
title: Ask zao whether a stream is live, so overlay-on-stream can be tested automatically
origin: parked
status: To Do
priority: low
labels:
  - testing
  - streaming
  - korrid
  - observability
created: 2026-07-31
source: se-work
---

# Ask zao whether a stream is live, so overlay-on-stream can be tested automatically

## Why it matters

The overlay was confirmed to work over a stream by watching the device, because every automated check was blind: the probe looked for an activity name that does not exist in the Artemis fork, and screenshots came back byte-identical across every step. Without a way to ask whether a stream is running, this behaviour cannot be regression-tested, and a future change could break it silently. A stream's truth lives on the host rather than the phone — the same shape found for launch endings — and korrid already tracks host sessions correctly, having surfaced a Skate 3 session started hours earlier.

## Acceptance Criteria

- [ ] A script can determine from korrid or zao whether a stream is currently being served
- [ ] The overlay-over-stream check runs without a human watching the screen

## Related

- `docs/research/overlay-over-a-stream.md`
