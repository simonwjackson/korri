---
id: 01KWGN0GJ8A52VCD1EQ6JDXBA6
slug: support-retroarch-on-headless-korri-source-machines-plugin-m
title: Support RetroArch on headless Korri source machines (plugin module is kiosk-gated)
origin: parked
status: To Do
priority: medium
labels:
  - korri
  - retroarch
  - source-machine
  - nixos
  - plugins
created: 2026-07-02
source: se-work
---

# Support RetroArch on headless Korri source machines (plugin module is kiosk-gated)

## Why it matters

The @korri:retroarch plugin's NixOS module only wires the RetroArch closure (retroarch binary on the session PATH, /etc/korri/cores/*.so, autoconfig, shader dir) under services.korri.compositor.kiosk.enable. Headless streaming sources (korri-source-machine, e.g. aka) therefore cannot launch RetroArch/libretro content even with @korri:retroarch enabled, unless the host hand-wires the binary+cores itself. I had to replicate the closure and /etc/korri/cores/mgba_libretro.so directly in aka's Mountainous host config to stream a GBA game. Source machines are supposed to be equivalent to portable devices minus the local GUI, so RetroArch streaming should be first-class there.

## Acceptance Criteria

- [ ] Enabling @korri:retroarch on a korri-source-machine host provides retroarch on the source session PATH and /etc/korri/cores without kiosk.enable
- [ ] A GBA (mGBA) library entry resolves and streams from a headless source with no per-host nix wiring
- [ ] The retroarch plugin module gates on streaming/source role too, not only kiosk

## Related

- `product/plugins/retroarch/nix/nixos-module.nix`
- `product/systems/nixos/modules/korri-daemon.nix`
- `hosts/aka/default.nix (mountainous)`
