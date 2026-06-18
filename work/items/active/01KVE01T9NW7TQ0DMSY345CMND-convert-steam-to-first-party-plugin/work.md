---
id: 01KVE01T9NW7TQ0DMSY345CMND
slug: convert-steam-to-first-party-plugin
title: Convert Steam to a first-party plugin
status: active
created: 2026-06-18
source: direct prompt
artifacts:
  - plan.md
---

# Convert Steam to a first-party plugin

Prepare and execute the architectural migration where Steam-specific launch, state, observability, cleanup, and Nix composition move behind a first-party `@korri:steam` plugin so generic Korri platform/services/apps code no longer knows about Steam.
