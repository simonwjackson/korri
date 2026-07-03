---
id: 01KWK4BCJ2BDM1JTVF7B3T2JF0
slug: codify-all-skate-3-stream-fidelity-hacks-once-rpcs3-plugin-c
title: Codify ALL Skate 3 / stream fidelity hacks once rpcs3 plugin config lands
origin: parked
status: To Do
priority: medium
labels:
  - korri
  - aka
  - bandai
  - rpcs3
  - moonlight
  - fidelity
  - codify
  - tech-debt
created: 2026-07-03
source: user
---

# Codify ALL Skate 3 / stream fidelity hacks once rpcs3 plugin config lands

## Why it matters

Today's max-fidelity Skate 3 streaming setup (1080p60 HEVC @18Mbps carrying an ~120fps supersampled 2160p rpcs3 render, with audio and DLC) was proven live but is built entirely from hand-applied runtime state. Complete inventory of every hack that must become declarative:

[Bandai - stream client]
1. /var/lib/korri/config/zzz-moonlight-fidelity.korri.yaml: host.moonlight.stream = {resolution 1920x1080, fps 60, bitrateKbps 18000} PLUS moonlight.environment nulls for MOONLIGHT_SEND_RUNTIME_SETTINGS_MVP_{AFTER_S,FPS,KBPS,RESOLUTION} (without the nulls the sm8550 platform env re-requests 720p/12000kbps ~6s into every stream).

[aka - rpcs3 emulator]
2. ~/.config/rpcs3/custom_configs/config_BLUS30464.yml: Video.Resolution Scale 300 (2160p supersample), Video.Anisotropic Filter Override 16, Video.Vblank Rate 120 (yields ~120fps uncapped, correct game speed - verified live), Core.Preferred SPU Threads 3 (anti physics-starvation/slow-mo per rpcs3 wiki for 12-thread CPUs), Video.Performance Overlay Enabled/Minimal (verification aid - turn OFF when codifying).
3. GLOBAL ~/.config/rpcs3/config.yml sed edit: 'Keep pads connected: true' (pad hotplug-timing guard; separate file from the per-game config).
4. Pad binding (rpcs3 plugin manages none of this today): ~/.config/rpcs3/input_configs/global/Default.yml Player 1 = Handler Evdev, Device "Sunshine X-Box One (virtual) pad"; plus legacy ~/.config/rpcs3/config_input.yml with same binding. Note the controller boot-race remains (pad created on first client input; rpcs3 scans at boot; workaround = wiggle at stream start; durable fix = eager pad creation, uncaptured).

[aka - game payload state, hand-copied, not reproducible]
5. Skate 3 dump repaired: complete 115-file disc folder at /srv/lakes/towada/gaming/games/sony-playstation-3/'Skate 3 [BLUS30464]' restored from yuki:~/Downloads/RPCS3_BLUS_Build.7z (subpath RPCS3_BLUS_Build/RPCS3/games/Skate_3_BLUS) after the original copy was truncated (missing shaders_final.big -> boot crash).
6. Title update v01.05 + DLC content: ~/.config/rpcs3/dev_hdd0/game/BLUS30464/ (888MB: USRDIR EBOOT.BIN update + DWAYPRK/MALOOFMC/FILMERPK/CREATOR/PLAY/PLAYER1F/PRESELL/PRJECT1/UNLCKALL) copied from the same archive. APP_VER=01.05 verified in boot log.
7. DLC licenses: ~/.config/rpcs3/dev_hdd0/home/00000001/exdata/*.rap (9 files) from the same archive - DLC dead without them.

[known ceiling]
8. 1080p120 stream fails (Bandai panel is 120Hz and aka renders 120fps, but moonlight video thread never pings at fps 120 - same silent-fail class; 1080p60 is the codified target until root-caused).

Gate: rpcs3 plugin config support (declarative settings + input materialization). Items 5-7 need at minimum documented provenance/restore procedure (archive kept on yuki) even if not Nix-managed.

## Acceptance Criteria

- [ ] Bandai moonlight 1080p60/18Mbps + MVP env nulls in source-controlled host/platform config; zzz- fragment deleted
- [ ] Skate 3 rpcs3 settings (scale 300/AF16/vblank 120/SPU threads 3) declared via rpcs3 plugin config; performance overlay off
- [ ] Keep-pads-connected + Evdev Sunshine-pad binding plugin-managed; works on fresh aka rebuild with zero hand edits
- [ ] Dump/update/DLC/licenses provenance documented with restore procedure (yuki archive) or made reproducible
- [ ] Fresh rebuild + reboot of both machines reproduces the full fidelity stack end-to-end
- [ ] 1080p120 limitation documented or fixed

## Related

- `/var/lib/korri/config/zzz-moonlight-fidelity.korri.yaml (bandai runtime)`
- `~/.config/rpcs3/custom_configs/config_BLUS30464.yml (aka runtime)`
- `~/.config/rpcs3/config.yml (aka runtime, Keep pads connected)`
- `~/.config/rpcs3/input_configs/global/Default.yml (aka runtime)`
- `~/.config/rpcs3/dev_hdd0/game/BLUS30464 + home/00000001/exdata (aka runtime, from yuki:~/Downloads/RPCS3_BLUS_Build.7z)`
- `product/plugins/rpcs3/src/plugin.ts`
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
