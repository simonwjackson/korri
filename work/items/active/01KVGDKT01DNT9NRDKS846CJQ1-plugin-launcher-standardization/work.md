---
id: 01KVGDKT01DNT9NRDKS846CJQ1
title: Plugin launcher/config standardization
status: done
created: 2026-06-19
completed: 2026-06-19
source: user
---

# Plugin launcher/config standardization

Completed a no-backwards-compat Korri readable-config and plugin-contract big-bang around the launcher/plugin domain model explored in `config-sketch.korri.yaml`.

## Completion evidence

- Canonical readable config shape is `launchers` + `release.launch`; legacy `release.apps`/`system.apps` compatibility was removed.
- Plugin contribution contract is standardized on `contributes.config.launchers`, launcher `plugin`, and `settings.plugin`.
- Systems are metadata/identity only.
- ZQuest Classic was added as a first-party launcher plugin and included in SM8550 kiosk composition.
- Broad automated verification passed before deploy; final targeted verification passed with 31 tests across authoring examples, plugin registry, and Nix plugin composition.
- Sobo was switched to `/nix/store/hngdpcqczj8128g6pkgwknrrsgbvfijb-nixos-system-sobo-25.11pre-git` and its preserved local config was migrated to the standardized readable schema.
- Live Sobo validation passed:
  - RetroArch launched `cool-spot-usa` through `genesis_plus_gx` and was observed running on-screen.
  - ZQuest Classic launched `to-the-top`, the prompt was dismissed with `ydotool`, and `/storage/cache/zquest-debug/to-the-top-after-prompt.png` shows gameplay beyond the prompt.
