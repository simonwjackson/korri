---
id: 01KX7SH5D5P5ZF9MDGVEMDYKTP
slug: fix-steam-gate-seed-interstitial-suppression-write-webstorag
title: "Fix steam-gate-seed interstitial suppression: write WebStorage path Steam actually reads"
origin: parked
status: To Do
priority: medium
labels:
  - korri
  - steam-plugin
  - ux
created: 2026-07-11
source: se-debug
context:
  cwd: /home/simonwjackson/code/sandbox/korri
  branch: trunk
  repo: korri
---

# Fix steam-gate-seed interstitial suppression: write WebStorage path Steam actually reads

## Why it matters

applySteamGateSeeds writes Deck_ConfiguratorInterstitials* keys under UserLocalConfigStore/Software/Valve/Steam, but Steam stores and reads them under UserLocalConfigStore/WebStorage (observed on aka: Steam recorded GamepadRecommended for app 2215200 at the WebStorage path with Checkbox=0 while the seeded Software/Valve/Steam keys sat ignored). All interstitial suppression the plugin performs is therefore a no-op; users hit controller-recommended/non-verified/gyro popups mid-stream. Steam semantics: VersionSeen_<base> (version int), Checkbox_<base> ("1" = don't show again), InterstitialApps_<base> (JSON array of appids already shown). Fixed manually on aka this session.

## Acceptance Criteria

- [ ] Seeds land under UserLocalConfigStore/WebStorage with VersionSeen/Checkbox/InterstitialApps semantics
- [ ] A fresh localconfig + launch of a controller-recommended app shows no interstitial
- [ ] Existing wrong-path keys are not duplicated further (optionally cleaned up)
