---
id: 01KWGQE3P5ZHTZ2S1MXS9REB0A
slug: decouple-inputplumber-retroarch-input-policy-from-kiosk-gati
title: Decouple InputPlumber/RetroArch input policy from kiosk gating
origin: parked
status: To Do
priority: high
labels:
  - korri
  - inputplumber
  - retroarch
  - source-machine
  - nixos
  - kiosk-gating
created: 2026-07-02
source: user
---

# Decouple InputPlumber/RetroArch input policy from kiosk gating

## Why it matters

The RetroArch plugin's entire NixOS config — cores at /etc/korri/cores, retroarch on the session PATH, and its InputPlumber-aware joypad-autoconfig input policy — is gated behind services.korri.compositor.kiosk.enable. Headless streaming source machines (korri-source-machine, e.g. aka) run InputPlumber and stream games, but get none of that wiring, so RetroArch launches with no joypad autoconfig and the streamed controller is unmapped (controls dead out of the box). InputPlumber is present and required on aka; the gap is that the input policy is keyed to kiosk instead of to the input provider / streaming role. This forced a hand-authored per-host fragment on aka to restore controls.

## Acceptance Criteria

- [ ] RetroArch input policy (udev joypad driver + autodetect + joypad autoconfig dir) applies whenever services.korri.input.provider.name == inputplumber, independent of kiosk.enable
- [ ] Headless source machines get RetroArch cores, retroarch on PATH, and the input policy without kiosk
- [ ] A streamed RetroArch game on a headless source has working controls OOB with no per-host fragment
- [ ] Verify the streamed pad (Sunshine virtual) is normalized to the target the autoconfig matches on source machines, not just kiosk

## Related

- `product/plugins/retroarch/nix/nixos-module.nix`
- `product/systems/nixos/modules/korri-input.nix`
- `product/systems/nixos/images/source-machine.nix`
- `01KWGN0GJ8A52VCD1EQ6JDXBA6`
- `/var/lib/korri/config/retroarch-gba.korri.yaml (aka runtime workaround)`
