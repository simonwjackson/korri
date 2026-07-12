---
id: 01KX6AETYPD25B5FA9TG3Z9YNM
slug: make-bandai-switch-restart-korri-user-daemons-reliably
title: Make Bandai switch restart Korri user daemons reliably
origin: parked
status: To Do
priority: medium
labels:
  - bandai
  - deployment
  - nixos
created: 2026-07-10
source: user
---

# Make Bandai switch restart Korri user daemons reliably

## Why it matters

After NixOS switch, Bandai kept serving old korrid/sessiond code until a manual user daemon-reload and service restart. That can make deployments appear successful while runtime validation still hits stale bugs.

## Acceptance Criteria

- [ ] A `device_nixos_rebuild`/nixie switch to Bandai leaves `korrid.service` and `korri-sessiond.service` running the newly deployed store paths without manual intervention.
- [ ] A validation check reports the active unit ExecStart/store path or build revision after switch.
- [ ] Documented fallback restart command is no longer needed in the Bandai deployment runbook.

## Related

- `product/systems/nixos/modules/korri-game-stream.nix`
- `/tmp/bandai-deploy/ssh_config_ip`

## Notes

Observed again while deploying 39bfbf3f: stream-state still returned the old undefined-field serialization failure until manual `systemctl --user daemon-reload; restart korrid.service korri-sessiond.service` as user korri.
