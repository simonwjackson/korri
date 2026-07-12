---
id: 01KXAF9XZ7AQWPV72DJ497PXG6
slug: investigate-bandai-wlan0-instability-deauth-loops-minutes-lo
title: Investigate Bandai wlan0 instability (deauth loops, minutes-long outages)
origin: parked
status: To Do
priority: medium
labels:
  - bandai
  - wifi
  - infrastructure
created: 2026-07-12
source: se-debug
---

# Investigate Bandai wlan0 instability (deauth loops, minutes-long outages)

## Why it matters

Bandai repeatedly drops off Wi-Fi: dmesg shows wlan0 "deauthenticating by local choice (DEAUTH_LEAVING)" followed by reconnects, a boot where association took ~4 minutes (3 auth attempts), and multiple multi-minute outages in one evening that broke SSH sessions, interrupted nixos-rebuild copies, and made Store searches return zero results. This blocks deploys and makes the acquisition UX unreliable regardless of app fixes.

## Acceptance Criteria

- [ ] Root cause identified (power save, driver, roaming, AP-side, or suspend interaction)
- [ ] Fix or mitigation applied (e.g. disable wifi powersave on wlan0, driver/firmware update, or AP change)
- [ ] Device stays associated for 24h+ under normal use without local-choice deauths in dmesg

## Notes

Evidence: dmesg wlan0 deauth at t=3742s with reassoc at t=3812s; boot with auth attempts at 93s/169s/246s before association; SSH/Tailscale/LAN all unreachable during windows. SSID "usu". Device: SM8550 (Bandai/thor).
