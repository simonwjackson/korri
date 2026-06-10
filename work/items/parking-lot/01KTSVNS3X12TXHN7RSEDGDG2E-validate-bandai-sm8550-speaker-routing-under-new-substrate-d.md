---
id: 01KTSVNS3X12TXHN7RSEDGDG2E
slug: validate-bandai-sm8550-speaker-routing-under-new-substrate-d
title: Validate Bandai SM8550 speaker routing under new substrate defaultSink
origin: parked
status: To Do
priority: high
labels:[]
created: 2026-06-10
source: se-work
---

# Validate Bandai SM8550 speaker routing under new substrate defaultSink

## Why it matters

The nix-on-rocks bump left rocknix.sm8550.audio.defaultSink.pcm/ucmVerb/ucmDevice null for Odin 2 Portal (WirePlumber owns default-sink selection). The Korri audio bootstrap is now null-safe and becomes an ordering-only no-op on Bandai, so audio relies on WirePlumber. This unblocked the build but the actual on-device speaker/volume routing must be re-verified — if WirePlumber does not select the speaker, Korri may need to set defaultSink.pcm/ucmVerb/ucmDevice explicitly for Bandai.

## Related

- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
