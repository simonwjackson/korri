---
id: 01KWM7Q408P6VW6RWR66SE6R3R
slug: author-rpcs3-input-config-content-pad-keyboard-mappings-decl
title: Author RPCS3 --input-config content (pad/keyboard mappings) declaratively
origin: parked
status: To Do
priority: medium
labels:
  - korri
  - rpcs3
  - input
  - plugins
  - settings
created: 2026-07-03
source: user
---

# Author RPCS3 --input-config content (pad/keyboard mappings) declaratively

## Why it matters

The RPCS3 plugin currently only PASSES THROUGH a named --input-config (referencing a pad profile RPCS3 already has on disk); it cannot AUTHOR the profile content. Operators still hand-edit RPCS3's input UI/files to define button/axis maps, deadzones, per-player pad assignments, and keyboard/mouse handlers. Making the mapping declarable in the Korri cascade closes the last hand-config gap for unattended, reproducible PS3 launches and feeds the broader cross-emulator input story.

## Acceptance Criteria

- [ ] RPCS3 pad/keyboard mappings (per-player handler/device, button/axis bindings, deadzones, handlers) are declarable in the plugin's unified settings tree
- [ ] The plugin materializes <state.root>/input_configs/<name>.yml atomically and references it via --input-config, without hand-editing RPCS3
- [ ] Input config keys/values are verified against RPCS3 source (like the config.yml value maps were)
- [ ] Operator's existing input configs are not clobbered (read-merge or dedicated korri-owned profile name)
- [ ] Design notes how this converges with the cross-emulator input vocabulary and existing Korri controller/inputplumber work

## Related

- `product/plugins/rpcs3/src/launch-spec.ts`
- `product/plugins/rpcs3/src/policy.ts`
- `product/plugins/rpcs3/src/mapping.ts`
- `product/plugins/rpcs3/src/materializer.ts`
- `product/plugins/rpcs3/src/config-render.ts`
- `work/items/active/20260702-rpcs3-settings-surface/plan.md`

## Notes

SELF-CONTAINED CONTEXT (fresh chat, no memory of the RPCS3 session):

CURRENT STATE (on trunk): product/plugins/rpcs3/src/launch-spec.ts composeRpcs3LaunchSpec accepts an optional `inputConfig` and emits `--input-config <name>` after `--config`. That's PASSTHROUGH ONLY — it assumes the named profile already exists. Nothing in the plugin writes the profile.

RPCS3 INPUT CONFIG FACTS: RPCS3 stores input configs SEPARATELY from config.yml — under the state/config dir at input_configs/<name>.yml (state.root IS the rpcs3 config dir; basename must be "rpcs3"; XDG_CONFIG_HOME/HOME are derived from its parent — see product/plugins/rpcs3/src/materializer.ts buildLaunchEnv). The input config file is its own YAML schema: per-player pad handler/device, button/axis bindings, deadzones/ranges, trigger thresholds, keyboard/mouse handlers. Verify exact keys against RPCS3 source (rpcs3/Input/ pad_settings / the input config serializer) the same way the settings surface verified config.yml keys against system_config.h.

TARGET: add an input schema to the plugin (buttons/axes/deadzones/handlers/per-player assignments), a renderer that writes <state.root>/input_configs/<name>.yml atomically (mirror the writeAtomic + read-merge pattern in product/plugins/rpcs3/src/materializer.ts and config-render.ts), and continue to reference it via --input-config. Keep it delivery-agnostic and inside the unified settings tree (product/plugins/rpcs3/src/policy.ts), consistent with how video/audio/boot are modeled.

CONVERGENCE: this is the INPUT analogue of the cross-emulator settings vocabulary item — a normalized controller-mapping vocabulary would let one mapping serve multiple emulators. Also relates to Korri's broader input/controller ownership work (there is a refactor/inputplumber-runtime-ownership effort in the repo). Coordinate so Korri isn't authoring pad maps two different ways.

DEFERRED because it is a separate, large schema in a different file, not needed to launch a game with an existing profile, and overlaps the controller story.
