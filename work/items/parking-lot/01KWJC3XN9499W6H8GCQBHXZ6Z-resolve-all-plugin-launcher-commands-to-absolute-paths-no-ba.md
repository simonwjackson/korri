---
id: 01KWJC3XN9499W6H8GCQBHXZ6Z
slug: resolve-all-plugin-launcher-commands-to-absolute-paths-no-ba
title: Resolve all plugin launcher commands to absolute paths (no bare-command launchers)
origin: parked
status: To Do
priority: medium
labels:
  - korri
  - plugins
  - launch-intent
  - streaming
  - tech-debt
  - principle
created: 2026-07-02
source: se-work
---

# Resolve all plugin launcher commands to absolute paths (no bare-command launchers)

## Why it matters

RetroArch's bare command: "retroarch" silently broke source-machine streaming because the launch intent requires an absolute command; it only worked locally because sessiond's PATH happened to include it. Any first-party plugin that projects a bare command name (relying on ambient PATH) has the same latent bug and violates the project principle of never relying on PATH. Nix already knows every binary's real path and already exposes stable /etc/korri convention paths for cores/shaders; launcher commands should be stable absolute paths the same way, so both local and streamed launches are explicit and reproducible. Audit gamescope, moonlight, neverball, steam, ryubing, gmloader, remap, etc. for bare-command launchers and give them stable absolute paths (or a shared helper that maps a plugin binary to a stable /etc/korri/bin path).

## Acceptance Criteria

- [ ] Audit lists every first-party plugin launcher whose command is a bare name (PATH-relative)
- [ ] Each is converted to a stable absolute path (e.g. /etc/korri/bin/<tool>) exposed by Nix, or documented why PATH is genuinely required
- [ ] A test/guard rejects new plugin launcher records whose command is not absolute
- [ ] No launcher depends on ambient PATH for game-command resolution on either local or streamed launches

## Related

- `product/plugins/retroarch/src/plugin.ts`
- `product/services/device/game-stream-launch-intent.ts`
- `product/systems/nixos/flake/default.nix`
- `01KWGPRQW5RW63BSXAZN88X69T`
