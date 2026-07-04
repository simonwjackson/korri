---
id: 01KWNQB99XYMX02RFY5GJ02SXD
slug: restart-korri-user-units-on-nixos-rebuild-switch-when-their-
title: Restart korri user units on nixos-rebuild switch when their config/store inputs change
origin: parked
status: To Do
priority: high
labels:
  - deploy
  - nixos
  - korrid
  - user-units
  - reliability
  - device-evidence
created: 2026-07-04
source: se-debug
---

# Restart korri user units on nixos-rebuild switch when their config/store inputs change

## Why it matters

On aka, a nixos-rebuild switch to gen-92 carried the rpcs3 config fix (new KORRI_CONFIG_ROOTS store path in the unit file) but the running korrid kept serving the old store config because korrid.service is a user unit and switch-to-configuration does not restart user units. The result was "deploy succeeded but the fix is not live," diagnosable only by comparing the unit file env against /proc/<pid>/environ. Korri user units (korrid, korri-sessiond, korri-compositor where safe) should restart when their rendered unit/env inputs change — e.g. via X-Restart-Triggers on the user units or an activation hook that bounces changed korri user services — so a switch reliably makes new config live.

## Acceptance Criteria

- [ ] After a switch that changes KORRI_CONFIG_ROOTS (or the korrid package), the running korrid uses the new store path without a manual restart.
- [ ] Verified on a real host: unit-file env matches /proc/<pid>/environ after switch.
- [ ] Restart behavior is scoped (does not needlessly kill an active game/stream session, or is documented if it must).
