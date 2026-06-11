---
id: 01KTT615NE4A0FW1RQGC82ZYF4
slug: seamless-steam-first-run-flow-on-sm8550-guest-seed-self-upda
title: Seamless Steam first-run flow on SM8550 guest (seed + self-update + Proton ARM64)
origin: parked
status: To Do
priority: medium
labels:
  - steam
  - sm8550
  - first-run
created: 2026-06-11
source: user
---

# Seamless Steam first-run flow on SM8550 guest (seed + self-update + Proton ARM64)

## Why it matters

Steam currently requires manual steps after flashing: seed as the right user, two-phase -exitsteam self-update (~650MB codecs/steamui), Proton ARM64 (appid 4628740) install, and compat-tool mapping. Without automating these, every fresh device repeats the 2026-06-10 bandai manual bring-up.

## Acceptance Criteria

- [ ] Fresh device reaches a working Steam Big Picture with Proton ARM64 installed without manual SSH steps
- [ ] All mutable Steam state owned by the session user
- [ ] Flow is idempotent across reboots and client self-updates

## Notes

Build on the vendored package (product/vendor/steam). First-launch flow (systemd unit or Korri-triggered): run seed as session user; run client twice with -steamdeck -exitsteam (no skip flags) to self-update; trigger steam://install/4628740; write default CompatToolMapping=proton11_arm64. Launch unit needs LimitNOFILE=524288, WorkingDirectory=$STEAM_HOME, session env (XDG_RUNTIME_DIR/WAYLAND_DISPLAY/DBus). Note /storage deprecation: paths move to korri-runtime pattern (/var/lib/korri/*).
