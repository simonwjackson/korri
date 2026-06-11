---
id: 01KTT1YSXVGP72PCQFHN53VT9Q
slug: productize-steam-launch-path-for-sm8550-guest-nix-on-rocks-k
title: Productize Steam launch path for SM8550 guest (nix-on-rocks + Korri)
origin: parked
status: To Do
priority: medium
labels:
  - steam
  - sm8550
  - nix-on-rocks
  - device
created: 2026-06-11
source: user
---

# Productize Steam launch path for SM8550 guest (nix-on-rocks + Korri)

## Why it matters

Steam Big Picture now runs on bandai/sobo, but only after a chain of manual fixes discovered during the live smoke. Each gap will recur on any fresh device unless folded into the substrate package/module and Korri session wiring.

## Acceptance Criteria

- [ ] Fresh sobo-class device reaches Steam Big Picture from a clean /storage with one documented command or Korri launch intent
- [ ] steamwebhelper does not crash-loop (taskset present in FHS capsule)
- [ ] Seeded Steam state is owned by the session user
- [ ] Client self-update bootstrap pass is part of the managed launch flow, not a manual step

## Related

- `docs/acceptance/steam-runtime-capsule-refactor-sobo-2026-05-23.md`

## Notes

Gaps found during the 2026-06-10 bandai smoke: (1) steam-arm64-seed must run as the session user or chown its output — root-owned STEAM_HOME silently breaks the client (token write + self-update). (2) unzip in the seed creates literal backslash-named dirs/symlinks from Valve zips (steamrtarm64\libs\..., steamrtarm64\swiftshader); symlinks must be recreated under the real dirs. (3) Seed alone is insufficient: the client needs one bootstrap pass (steam -steamdeck -exitsteam WITHOUT -skipinitialbootstrap/-nobootstrapupdate) to pull bins_codecs etc. (patched ffmpeg libavutil.so.60 with av_malloc_tracked lands in steamrtarm64/video) — mirrors ROCKNIX start_steam.sh two-phase launch. (4) taskset missing in the FHS capsule (add util-linux to targetPkgs) — steamwebhelper.sh crash-loops with exec: taskset: not found; smoke worked around by sed-ing the script. (5) Steam needs LimitNOFILE≈524288; launching from the default session ulimit (1024) dies with 'Too many open files' — needs a systemd unit or scope. (6) FEX rootfs absent at /storage/.local/share/fex-emu/RootFS/ArchLinux — x86/x86_64 titles untested. (7) bwrap fails when cwd is unreadable by the steam user (chdir /root) — launcher should cd to STEAM_HOME. Launch wiring used: systemd-run --uid=korri -p LimitNOFILE=524288 with XDG_RUNTIME_DIR=/run/user/2000, WAYLAND_DISPLAY=wayland-1.
