---
id: 01KVAW869GW82T1WA01GNJHB18
slug: colocate-gamescope-launch-companion-behavior-in-plugin
title: Colocate Gamescope launch-companion behavior in plugin
origin: parked
status: To Do
priority: medium
labels:
  - architecture
  - plugins
  - gamescope
created: 2026-06-17
source: user
---

# Colocate Gamescope launch-companion behavior in plugin

## Why it matters

Gamescope is now a first-party plugin identity, but some policy constants, config normalization, and launch-companion handling still live in generic library config code. Keeping behavior split makes plugin ownership unclear and increases the chance future launch companions copy special-case Gamescope wiring instead of using a generic plugin contribution path.

## Acceptance Criteria

- [ ] Gamescope-specific constants and policy helpers live under product/plugins/gamescope or a plugin-owned module exported from there.
- [ ] Generic config/library code depends on plugin launch-companion contributions rather than importing Gamescope-specific IDs/helpers directly where avoidable.
- [ ] Tests cover Gamescope policy resolution through the plugin contribution path and at least one non-Gamescope/fake launch companion to prove the generic path.
- [ ] Temporary handoff/debt notes about internal context.gamescope or non-colocated Gamescope behavior are resolved or updated.

## Related

- `product/plugins/gamescope/index.ts`
- `product/platform/plugin/registry.ts`
- `product/platform/library/config`
- `docs/handoffs/2026-06-17-gamescope-plugin-launch-companion-temporary-handoff.md`

## Notes

Raised after deploy/latency debugging: user noted all Gamescope code should have been colocated in the plugin.
