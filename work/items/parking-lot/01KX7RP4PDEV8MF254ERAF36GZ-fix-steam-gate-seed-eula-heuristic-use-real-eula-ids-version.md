---
id: 01KX7RP4PDEV8MF254ERAF36GZ
slug: fix-steam-gate-seed-eula-heuristic-use-real-eula-ids-version
title: "Fix steam-gate-seed EULA heuristic: use real EULA ids/versions from appinfo"
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

# Fix steam-gate-seed EULA heuristic: use real EULA ids/versions from appinfo

## Why it matters

applySteamGateSeeds guesses localconfig EULA keys as {appId}_eula_{0,1,2}="1", but Steam stores acceptance as <actual-eula-id>=<current-eula-version> (e.g. Hi-Fi RUSH is 1817230_eula_1 version 4, Skyrim SE is 1271700_eula_0 version 15). Any app whose EULA index isn't 0-2 or whose version exceeds 1 still prompts on every launch, interrupting streams. The correct id+version pairs are available locally in Steam's appcache/appinfo.vdf (binary VDF: id string followed by a version int32 field). Fixed manually on aka this session by parsing appinfo.vdf and seeding exact values into both userdata localconfigs.

## Acceptance Criteria

- [ ] Gate seeding derives EULA id+version from appinfo.vdf (or an equivalent authoritative source) instead of the index-0..2/value-1 guess
- [ ] A launch of an app with a versioned EULA (version > 1, index != 0) shows no Steam EULA prompt on a fresh localconfig
- [ ] Falls back safely (no bad writes) when appinfo.vdf lacks the app or cannot be parsed
