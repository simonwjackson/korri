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
- Code-review fixes applied after the first formal review:
  - File, executable, provider-ref, and file-set targets now resolve through one validated object-target path; file-set selection honors `release.launch.input`.
  - Launchable release semantics are consistently `target` + `launch`; target-only/known-only releases remain metadata but are not launchable.
  - `release.launch.plugin` selects an enabled launcher by provider id and rejects ambiguous matches.
  - Release-scoped `settings.plugin.content.path` is stripped so plugin policy cannot override the resolver's storage-validated content path.
  - Legacy/control adapters emit object targets instead of string targets.
  - ZQuest Classic now has a readable launch integration plus plugin/package README docs.
- Review-fix verification passed:
  - `bun test` review-focused regression suite: 145 pass.
  - Schema/game-assets/config-graph regression suite: 118 pass.
  - `nix build --impure .#checks.$system.zquest-classic-check --no-link`.
  - Full `bun test` no longer reports standardization/schema regressions; remaining failures are unrelated existing guardrail/environment tests (`nix` boundary, naming guardrails, mDNS bootstrap, local foreground adapter).
- Post-rebase Steam proof preservation:
  - Restored local-trunk `steam-guest-runtime-prep`/smoke proof so `srt-bwrap` direct-FEXs `${FEX_ROOTFS}/usr/bin/bwrap` via `/usr/bin/FEX` with `/run/current-system/sw/bin` prepended to `PATH`.
  - Verified 30XX/`thirty-xx` still resolves through the Steam AppID path (`steam -applaunch 1029210`) in the Steam materializer and repository launch-resolution tests; no direct `30XX.exe` launch path was introduced.
  - Verified Steam boundary tests still prevent generic platform/server code from importing Steam plugin internals.
