---
id: 01KXCTKT2R3XM9Z59EZGYYZ4N6
slug: restart-not-just-reload-korrid-on-deploy-so-plugin-launcher-
title: Restart (not just reload) korrid on deploy so plugin launcher config changes take effect
origin: parked
status: To Do
priority: medium
labels:
  - deploy
  - korrid
  - sm8550
created: 2026-07-13
source: se-debug
---

# Restart (not just reload) korrid on deploy so plugin launcher config changes take effect

## Why it matters

nixos-rebuild switch reloaded korrid but left it running the old plugin launcher config, so the Steam gamescope opt-out did not apply until a manual `systemctl --user restart korrid`. Deploys that change plugin launcher/companion config silently ship stale launch resolution until the next korrid restart.

## Acceptance Criteria

- [ ] korrid picks up plugin launcher/companion config changes after a normal deploy without manual restart
- [ ] Dry-run launch spec reflects new launcher config immediately post-switch
