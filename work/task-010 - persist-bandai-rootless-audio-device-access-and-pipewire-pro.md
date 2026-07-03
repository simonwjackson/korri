---
id: task-010
title: Persist Bandai rootless audio device access and PipeWire profile
status: To Do
priority: high
labels:
  - bandai
  - audio
  - rootless
  - sm8550
created: 2026-06-10
source: user
---

# Persist Bandai rootless audio device access and PipeWire profile

## Why it matters

Bandai rootless launches run audio as the korri user; without persistent /dev/snd access and a non-off PipeWire card profile, PipeWire falls back to Dummy Output and games are silent after reboot.

## Acceptance Criteria

- [ ] korri has persistent access to /dev/snd playback/control devices on SM8550 kiosk images
- [ ] PipeWire/WirePlumber exposes a real AYN-Thor playback sink after boot without live ACLs
- [ ] Default sink is not auto_null/Dummy Output
- [ ] A launched RetroArch game produces audible audio through the expected Bandai speaker/headphone path

## Related

- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- `product/systems/nixos/images/kiosk.nix`

## Notes

Live workaround applied on Bandai: setfacl -m u:korri:rw /dev/snd/*, restarted user pipewire/wireplumber/pipewire-pulse, pactl set-card-profile alsa_card.platform-sound pro-audio, default sink alsa_output.platform-sound.pro-output-0.
