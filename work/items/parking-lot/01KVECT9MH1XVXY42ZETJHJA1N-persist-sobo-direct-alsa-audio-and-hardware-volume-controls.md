---
id: 01KVECT9MH1XVXY42ZETJHJA1N
slug: persist-sobo-direct-alsa-audio-and-hardware-volume-controls
title: Persist Sobo direct-ALSA audio and hardware volume controls
origin: parked
status: To Do
priority: high
labels:
  - sobo
  - audio
  - inputd
  - retroarch
  - sm8550
created: 2026-06-18
source: user
---

# Persist Sobo direct-ALSA audio and hardware volume controls

## Why it matters

Sobo's PipeWire graph exposes only `auto_null`, so RetroArch audio was silent until routed directly to the Odin2 ALSA PCM. The live fix is mutable and partly ACL-based, so it will not survive reboot/redeploy unless source-controlled in the Sobo/SM8550 device profile.

## Acceptance Criteria

- [ ] RetroArch launches on Sobo include `audio_device = "sysdefault:CARD=AYNOdin2"` or an equivalent source-controlled direct hardware route.
- [ ] Sobo boot/deploy grants `korri` read access to physical volume key event nodes (`pmic_resin` volume-down and `gpio-keys` volume-up) without manual `setfacl`.
- [ ] `KORRI_INPUTD_VOLUME_UP` and `KORRI_INPUTD_VOLUME_DOWN` are source-controlled to adjust the Odin2 direct ALSA stream mixer instead of PipeWire `auto_null`.
- [ ] A launch-time or post-audio-device-open baseline sets `stream0.vol_ctrl0 MultiMedia1 Playback Volu` to a safe audible level so new RetroArch launches do not start at 0%.
- [ ] Validation shows a running game has `/dev/snd/pcmC0D0p` open, audible audio, and physical volume keys change the ALSA mixer.

## Related

- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- `/var/lib/korri/config/local.korri.yaml`
- `/home/korri/.config/systemd/user/korri-inputd.service.d/volume.conf`
- `/dev/input/event1`
- `/dev/input/event5`

## Notes

Live findings: PipeWire/Pulse default sink was `auto_null`; RetroArch stream was a PipeWire ALSA sink-input to dummy output. Direct `speaker-test -D sysdefault:CARD=AYNOdin2` was audible. Live config added `audio_device: sysdefault:CARD=AYNOdin2`; RetroArch now opens `/dev/snd/pcmC0D0p`. Live ACLs: `setfacl -m u:korri:rw /dev/input/event1 /dev/input/event5`. Live wrappers: `/home/korri/.local/bin/odin2-volume-up/down` call `amixer -q -c 0 sset "stream0.vol_ctrl0 MultiMedia1 Playback Volu" 5%+/-`, injected via inputd user-service drop-in. Relaunch reset the mixer to 0%, so it was manually restored to 8% after launch.
