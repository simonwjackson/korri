---
id: 01KVAW869GW82T1WA01GNJHB18
slug: colocate-gamescope-launch-companion-behavior-in-plugin
title: Colocate Gamescope launch-companion behavior in plugin
type: refactor
status: active
created: 2026-06-17
source: user
priority: medium
labels:
  - architecture
  - plugins
  - gamescope
---

# Colocate Gamescope launch-companion behavior in plugin

Graduated from parking lot after the Gamescope launch companion migration exposed that the plugin identity exists but Gamescope-specific policy, merge, normalization, and wrapper behavior remain split across generic platform config and launch code.
