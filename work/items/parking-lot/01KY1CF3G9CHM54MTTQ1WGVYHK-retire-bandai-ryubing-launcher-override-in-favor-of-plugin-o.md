---
id: 01KY1CF3G9CHM54MTTQ1WGVYHK
slug: retire-bandai-ryubing-launcher-override-in-favor-of-plugin-o
title: Retire Bandai ryubing launcher override in favor of plugin-owned gamescope path
origin: parked
status: To Do
priority: medium
labels:
  - bandai
  - ryubing
  - cleanup
created: 2026-07-21
source: user
---

# Retire Bandai ryubing launcher override in favor of plugin-owned gamescope path

## Why it matters

Switch launches on Bandai still route through the device-local override (/var/lib/korri/config/ryubing-sd.korri.yaml -> /var/lib/korri/ryubing-direct-x11-debug.sh). The wrapper is now clean (config-rewriting removed 2026-07-20; it only wraps Ryujinx in mangohud+gamescope FSR), but it pins nix store paths that go stale on every deploy and bypasses the ryubing plugin's own launch spec. The durable home for the gamescope/FSR/MangoHud presentation chain is the plugin or catalog config, after which both the override file and wrapper can be deleted.

## Acceptance Criteria

- [ ] Switch games launch through the ryubing plugin path with equivalent presentation (gamescope 720p->FSR->1080p, MangoHud optional)
- [ ] /var/lib/korri/config/ryubing-sd.korri.yaml removed from the device
- [ ] /var/lib/korri/ryubing-direct-x11-debug.sh removed from the device
- [ ] DK and Wonder catalog hooks still fire on launch/quit
