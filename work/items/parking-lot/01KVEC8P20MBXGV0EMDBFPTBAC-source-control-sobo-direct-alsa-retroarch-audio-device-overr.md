---
id: 01KVEC8P20MBXGV0EMDBFPTBAC
slug: source-control-sobo-direct-alsa-retroarch-audio-device-overr
title: Source-control Sobo direct ALSA RetroArch audio-device override
origin: parked
status: To Do
priority: medium
labels:
  - sobo
  - retroarch
  - audio
  - device-profile
created: 2026-06-18
source: user
---

# Source-control Sobo direct ALSA RetroArch audio-device override

## Why it matters

Sobo game audio was silently routed to PipeWire's auto_null dummy sink because no hardware PipeWire sink was registered. A live mutable config override fixed RetroArch by targeting the audible Odin2 ALSA device directly, but the fix will be fragile until captured in the device/profile config.

## Acceptance Criteria

- [ ] Sobo's source-controlled device/profile configuration emits `audio_device = "sysdefault:CARD=AYNOdin2"` (or an equivalent durable audio route) for RetroArch launches.
- [ ] A deployed Sobo RetroArch launch opens `/dev/snd/pcmC0D0p` or a real hardware PipeWire sink, not `auto_null`.
- [ ] A smoke test documents that a game launch produces audible audio on device speakers/headphones.

## Related

- `/var/lib/korri/config/local.korri.yaml`
- `product/plugins/retroarch/src/plugin.ts`
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`

## Notes

Live fix applied on Sobo: added `audio_device: sysdefault:CARD=AYNOdin2` under RetroArch `extraSettings`. Diagnosis: RetroArch ALSA stream previously appeared as a PipeWire sink input routed to `auto_null`; direct `speaker-test -D sysdefault:CARD=AYNOdin2` was audible.
