---
id: 01KWM7Q407Q0QDVZ4SY4BZBKHY
slug: normalized-cross-emulator-settings-vocabulary-shared-semanti
title: Normalized cross-emulator settings vocabulary (shared semantic tree + per-plugin mapping tables)
origin: parked
status: To Do
priority: high
labels:
  - korri
  - launch-config
  - plugins
  - settings
  - cross-emulator
created: 2026-07-03
source: user
---

# Normalized cross-emulator settings vocabulary (shared semantic tree + per-plugin mapping tables)

## Why it matters

Common concepts — resolution, aspect ratio, fullscreen, frame limit, vsync, audio volume/device/backend, language — should be declared ONCE in emulator-neutral terms at a high cascade layer and translated per plugin, instead of re-authored per emulator. Endgame: an operator sets `resolution: 1280x720` (or a handheld/TV profile) once at user/system level and it lands correctly whether a release runs on RPCS3, Ryubing, or RetroArch. This is the "configure my whole library's common preferences once" payoff and the unifying north star behind the per-plugin settings work.

## Acceptance Criteria

- [ ] A shared, emulator-neutral settings vocabulary exists in the inheritable/cascade layer (modeled like MoonlightPolicy), covering at least the rpcs3∩ryubing intersection
- [ ] RPCS3 and Ryubing each translate the shared vocabulary into their native config via a per-plugin mapping table; per-emulator-only settings still work
- [ ] Setting a shared key once at user/system/profile level applies correctly across both emulators (integration test through the cascade)
- [ ] No lossy common-denominator: emulators with a capability honor it; those without cleanly ignore/omit it
- [ ] Design is derived from the two existing instances (rpcs3 mapping.ts, ryubing policy.ts), documented

## Related

- `product/plugins/rpcs3/src/policy.ts`
- `product/plugins/rpcs3/src/mapping.ts`
- `product/plugins/ryubing/src/policy.ts`
- `product/platform/library/config/inheritable-fields.ts`
- `product/platform/library/config/cascade-resolver.ts`
- `work/items/active/20260702-rpcs3-aka-source-plugin/rpcs3-settings-maximalist-proposal.md`
- `work/items/active/20260702-rpcs3-settings-surface/plan.md`

## Notes

SELF-CONTAINED CONTEXT (fresh chat, no memory of the RPCS3 session):

WE NOW HAVE TWO REAL INSTANCES OF THE UNIFIED-TREE PATTERN (this de-risks starting: the design should be extracted FROM these two, not guessed):
1. RPCS3 (reference, just shipped): product/plugins/rpcs3/src/policy.ts is a strict Effect Schema grouped by semantic DOMAIN (video/audio/boot/system/state/firmware), delivery-agnostic. product/plugins/rpcs3/src/mapping.ts is the MAPPING TABLE: routeSettings(policy) translates each clean Korri name to a delivery bucket (argv flag / config.yml key / GUI ini) AND to the emulator's exact string via value maps (all verified against RPCS3 system_config.h / system_config_types.cpp). Design doc + rationale: work/items/active/20260702-rpcs3-aka-source-plugin/rpcs3-settings-maximalist-proposal.md (this is the ORIGIN doc; section 10 sketches the normalized cross-emulator policy).
2. Ryubing (second data point): product/plugins/ryubing/src/policy.ts ALREADY has a rich typed policy with display/graphics/audio/console groups + value maps. So rpcs3 + ryubing are the two concrete instances to derive the shared vocabulary from.

WHY IT WAS DEFERRED (respect this): premature cross-emulator abstraction is a classic trap — we intentionally built RPCS3 standalone first to prove the tree+mapping pattern before generalizing. That gate is now essentially met (two instances exist).

PRECEDENT FOR A SHARED TYPED POLICY AT THE INHERITABLE LAYER: MoonlightPolicy in product/platform/library/config/inheritable-fields.ts — a curated typed policy (enum literals + value maps) that lives in the generic cascade, not a plugin. The cross-emulator settings policy would live similarly (inheritable, folded across layers), and each plugin registers a mapping from the shared vocabulary to its own config.

DESIGN SHAPE TO AIM FOR: a small shared vocabulary (start with the intersection of rpcs3+ryubing: resolution, aspectRatio, fullscreen, frameLimit, vsync, audio.volume/device/backend, language) declared once; each plugin provides a mapping table (like rpcs3 mapping.ts) that translates shared→native; per-emulator-only knobs stay in each plugin's own namespace; conflicts resolved by cascade specificity. Do NOT force emulators with different capabilities into a lossy common denominator — shared vocabulary is additive, plugin-specific stays available.

RELATIONSHIP TO OTHER BACKLOG ITEMS: pairs with the escape-hatch convergence item (fleet overrides) and the RPCS3 input-config item (a cross-emulator INPUT vocabulary is the same idea for controllers).
