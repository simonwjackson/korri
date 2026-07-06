---
id: 01KWWCGD70Z5WYSGSZ1JRPFYE7
slug: remove-plugin-compatibility-layer-after-abi-migration
title: Remove plugin compatibility layer after ABI migration
origin: parked
status: To Do
priority: high
labels:
  - plugin-ecosystem
  - cleanup
  - compatibility-removal
created: 2026-07-06
source: user
---

# Remove plugin compatibility layer after ABI migration

## Why it matters

Korri should not support parallel plugin compatibility paths long-term. Keeping KORRI_ENABLED_PLUGINS translation and legacy registry helper APIs after the unified ABI is adopted creates ambiguity about the real control plane, encourages new call sites to depend on backwards compatibility, and contradicts the product direction that there is one plugin ABI.

## Acceptance Criteria

- [ ] All runtime and test/dev call sites use plugin policy/state directly instead of KORRI_ENABLED_PLUGINS compatibility translation.
- [ ] createFirstPartyPluginRegistryFromEnv and createInteractiveFirstPartyPluginRegistry compatibility exports are removed or replaced with explicit policy/state APIs.
- [ ] pluginPolicyFromEnabledPluginEnv and parseEnabledPluginIds are removed or demoted to narrowly scoped test fixtures if no production code needs them.
- [ ] Documentation states there is no legacy/backwards-compatible plugin path; bundled, local, and future third-party plugins use the same ABI.
- [ ] Focused plugin-host/platform-plugin tests pass and prove no env-var compatibility authority remains.

## Related

- `product/plugin-host/index.ts`
- `product/plugin-host/state.ts`
- `product/platform/plugin/policy.ts`
- `product/platform/plugin/registry.ts`
- `product/plugins/AGENTS.md`
- `work/items/active/20260703-plugin-ecosystem-api/plan.md`

## Notes

User explicitly requested this as the final step: do not support backwards compatibility overall; remove the compatibility layer once the migration is complete.
