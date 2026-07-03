---
id: 01KWM7Q404QGHCX0XVA8R7PF50
slug: converge-fleet-escape-hatches-steam-ryubing-retroarch-extra-
title: Converge fleet escape hatches (Steam/Ryubing/RetroArch `extra`) onto the settled LaunchOverrides
origin: parked
status: To Do
priority: high
labels:
  - korri
  - launch-config
  - plugins
  - refactor
  - escape-hatch
created: 2026-07-03
source: user
---

# Converge fleet escape hatches (Steam/Ryubing/RetroArch `extra`) onto the settled LaunchOverrides

## Why it matters

Today every emulator plugin has its own inconsistent break-glass under settings.plugin: ryubing `extra:{args,config}`, steam `extra:{args}` + `launch-options`, retroarch `extraSettings`/`extraArgs`/`configFile.append`. The RPCS3 settings-surface work established the SETTLED shape — `LaunchOverrides` (release.launch.overrides.{args,config}) — and proved it end-to-end on one launcher. Converging the fleet gives authors ONE escape-hatch vocabulary, lets the generic composer own application uniformly, kills per-plugin drift, and removes a class of "which field do I use for this plugin" confusion. High leverage, low conceptual risk now that the pattern is proven.

## Acceptance Criteria

- [ ] Generic composer (compose-launch-spec.ts) applies context.overrides.args to argv (prepend/append/replace) and overrides.config to the launcher's native config file, with the documented merge semantics, covered by tests
- [ ] RPCS3 materializer's bespoke override application is removed in favor of the generic path (or proven equivalent)
- [ ] Steam, Ryubing, and RetroArch no longer define plugin-buried extra/extraSettings/extraArgs; authors use release.launch.overrides
- [ ] A migration/deprecation path keeps existing configs using the old fields working (with a warning) or migrates them
- [ ] Security boundary preserved: overrides never sourced from the ephemeral layer; release-scoped root-redirect keys stay stripped

## Related

- `product/platform/library/config/records/library-item.ts`
- `product/platform/library/config/cascade-resolver.ts`
- `product/platform/library/config/resolved-launch-context.ts`
- `product/platform/library/config/compose-launch-spec.ts`
- `product/plugins/rpcs3/src/materializer.ts`
- `product/plugins/rpcs3/src/config-render.ts`
- `product/plugins/rpcs3/src/launch-spec.ts`
- `product/plugins/ryubing/src/policy.ts`
- `product/plugins/ryubing/src/launch-spec.ts`
- `product/plugins/steam/src/materializer.ts`
- `product/plugins/retroarch/src/launch-spec.ts`
- `work/items/active/20260702-rpcs3-settings-surface/plan.md`

## Notes

SELF-CONTAINED CONTEXT (this will be picked up in a fresh chat with no memory of the RPCS3 session):

CURRENT STATE (already on trunk, done in the RPCS3 settings-surface work):
- `LaunchOverrides` schema is EXPORTED from product/platform/library/config/records/library-item.ts (~line 118): { args?: {prepend?,append?,replace?: string[]}, config?: {prepend?,append?,replace?: string} }. Attached as ReleaseLaunch.overrides (~line 145).
- It is resolved onto ReadableResolvedLaunchContext.overrides (product/platform/library/config/resolved-launch-context.ts) via foldLaunchOverrides in product/platform/library/config/cascade-resolver.ts.
- MERGE SEMANTICS (decided, keep them): prepend/append ACCUMULATE across cascade layers in inheritance order (arrays concat; config text newline-joined / deep-merged); replace is MOST-SPECIFIC-WINS. For args, overrides.args.replace swaps ONLY the plugin's routed-flags segment, never structural flags (--no-gui/--config) or the game path.
- SECURITY BOUNDARY (do not regress): overrides are folded from the PERSISTED release.launch.overrides layer ONLY, never the ephemeral/runtime override layer, because app.library.launch is unauthenticated on trusted-LAN (see ephemeral-override.ts:161-165). Release-scoped plugin settings are also filtered by stripReleaseScopedRootOverrides in cascade-resolver.ts (strips content/state/firmware so a release cannot redirect operator roots).
- overrides.config is PLAIN TEXT in the emulator's NATIVE format (YAML for rpcs3, JSON for ryubing, cfg/ini for retroarch). RPCS3 applies it by PARSE + DEEP-MERGE (not blind string append) to avoid duplicate-key hazards; replace wins the whole file. Reference impl: product/plugins/rpcs3/src/config-render.ts (renderConfigYaml, precedence canonical<routed<prepend<append) and product/plugins/rpcs3/src/launch-spec.ts (argv order).

PREREQUISITE (do this first — it is deferred item "generic composer overrides"): wire context.overrides into the GENERIC composer product/platform/library/config/compose-launch-spec.ts so ANY launcher applies args to argv and config to its native config file with the documented merge rules. Currently only the RPCS3 materializer consumes overrides (product/plugins/rpcs3/src/materializer.ts). Until the generic composer applies overrides, convergence has nowhere to land for steam/ryubing/retroarch.

TARGET: retire the bespoke fields. ryubing/src/policy.ts RyubingExtraPolicy + launch-spec.ts (extra.args ~line 31, extra.config merge ~line 161); steam/src/materializer.ts (extra + launch-options); retroarch/src/launch-spec.ts (~line 121 extraSettings/extraArgs/configFile.append). Everything becomes release.launch.overrides.{args,config}.

MIGRATION: live configs use the old fields — provide a deprecation/compat path (accept old `extra` and translate, warn) or a one-shot config migration, so existing setups don't break. Keep `launch-options` (steam %command% templating) considered explicitly — it may not be a pure override and might stay steam-specific.
