---
id: task-057
title: Implement Moonlight readable policy cascade core
status: In Progress
priority: high
labels:
  - moonlight
  - readable-config
  - cascade
  - typed-policy
created: 2026-06-08
source: se-plan
context:
  cwd: .
  branch: trunk
  commit: eabfc08
  repo: simonwjackson/korri
  invoked_by: user
---

# Implement Moonlight readable policy cascade core

## Why it matters

Chunk A of the typed Moonlight policy plan needs to be runnable outside this context window. It establishes the public readable contract and cascade behavior before launch paths depend on it, preventing another env/argv-shaped configuration seam from spreading.

## Acceptance Criteria

- [ ] `MoonlightPolicy` and `decodeMoonlightPolicy` exist in `product/platform/library/config/inheritable-fields.ts` with strict excess-property rejection.
- [ ] All relevant readable record schemas opt in to `moonlight` explicitly: host, user, system, launcher, profile, preset, app, runtime, source, and library item records.
- [ ] `foldMoonlight` resolves scalars last-wins, nested objects by leaf, `input.devices`/`extraArgs` by cascade-order concat, and nullable environment overlays as explicit unsets in the resolved policy.
- [ ] Local launcher policy resolution can return Moonlight policy together with sibling Gamescope policy for launcher id `moonlight` without requiring a federated game id.
- [ ] Tests cover valid representative policy decode, rejected retired fields (`action`, `app`, `config`, `resolution.preset`, `platform.source`, `input.requireInputPlumber`, `control.commands`, `runtimeSettings.adaptationSpike`, `KORRI_MOONLIGHT_*`), per-layer decode, cascade merge, and local launcher resolution.

## Related

- `docs/plans/2026-06-08-002-feat-typed-moonlight-policy-api-plan.md`
- `docs/brainstorms/2026-06-08-002-moonlight-policy-one-to-one.example.yaml`
- `product/platform/library/config/inheritable-fields.ts`
- `product/platform/library/config/cascade-resolver.ts`
- `product/platform/library/config/resolved-launch-context.ts`
- `product/platform/library/proseql/library-repository.ts`

## Notes

Agentic Chunk A from the plan. Covers U1 and U2. Do not implement launch call-site migration in this chunk except minimal plumbing needed for tests. Preserve product cuts from the example: no user-authored Moonlight action, app name/host, config load/save, resolution preset, platform provenance, InputPlumber toggle, or configurable control command capabilities. `runtimeSettings.oneShot` may be decided during implementation, but `adaptationSpike` is explicitly out of v1 readable policy.
