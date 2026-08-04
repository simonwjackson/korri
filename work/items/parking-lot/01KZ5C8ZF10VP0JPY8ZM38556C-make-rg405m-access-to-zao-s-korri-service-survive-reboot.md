---
id: 01KZ5C8ZF10VP0JPY8ZM38556C
slug: make-rg405m-access-to-zao-s-korri-service-survive-reboot
title: Make RG405M access to Zao’s Korri service survive reboot
origin: parked
status: To Do
priority: high
labels:
  - federation
  - zao
  - android
  - networking
created: 2026-08-04
source: user
context:
  branch: main
  commit: 862c045e
  repo: korri
---

# Make RG405M access to Zao’s Korri service survive reboot

## Why it matters

Neverball is now visible and launchable from Zao’s own Korri game list, but the narrowly scoped Zao firewall allowance was applied live and will disappear when Zao reboots.

## Acceptance Criteria

- [ ] Zao permanently allows the RG405M to reach TCP port 43117 using repository-controlled configuration
- [ ] The RG405M shows Neverball from Zao after Zao reboots
- [ ] The port is not exposed more broadly than necessary

## Related

- `services/korrid/deploy/host.zao.toml`
- `services/korrid/deploy/push-zao.sh`
