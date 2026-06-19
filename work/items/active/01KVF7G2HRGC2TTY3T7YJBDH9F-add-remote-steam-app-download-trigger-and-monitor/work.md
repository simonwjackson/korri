---
id: 01KVF7G2HRGC2TTY3T7YJBDH9F
slug: add-remote-steam-app-download-trigger-and-monitor
title: Add remote Steam app download trigger and monitor
status: completed
created: 2026-06-19
source: parking-lot
artifacts:
  - plan.md
---

# Add remote Steam app download trigger and monitor

Implemented a first-class Korri/Korrid path for remotely requesting Steam app installs or updates through the logged-in local Steam client, then monitoring honest download/install state from Steam-owned manifests and logs without storing Steam credentials or using Steam UI as the primary operator surface.

Completed in `feat(steam): add remote install trigger and status` and verified with the plan's targeted Bun suite plus `nix build .#checks.x86_64-linux.korri-sm8550-kiosk-config --no-link`.
