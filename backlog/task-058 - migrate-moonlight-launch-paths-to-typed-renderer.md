---
id: task-058
title: Migrate Moonlight launch paths to typed renderer
status: In Progress
priority: high
labels:
  - moonlight
  - launch
  - renderer
  - local-control
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

# Migrate Moonlight launch paths to typed renderer

## Why it matters

Chunk B replaces duplicate Moonlight argv/env construction with one renderer and migrates both CLI/desktop and remote-source launches. Capturing it separately keeps the high-risk launch behavior slice executable after the schema/cascade core lands.

## Acceptance Criteria

- [ ] `product/platform/stream/moonlight-launch-spec.ts` exists and is the canonical pure renderer for `moonlight stream` launch specs.
- [ ] `LaunchSpec` has an explicit env-unset mechanism, or the implementation reuses an equivalent mechanism already introduced by the typed Gamescope work; env unsets survive intent persistence and spawn.
- [ ] `compose-moonlight-launch-spec.ts` and `moonlight-launcher.ts` delegate to the shared renderer and no longer hand-compose Moonlight flags or read `KORRI_MOONLIGHT_*` launch-policy env vars.
- [ ] CLI/desktop launches and remote-source `app.library.launch` render identical Moonlight args for the same policy and launch facts.
- [ ] Remote-source launches allocate/inject `MOONLIGHT_LOCAL_CONTROL_*` env before intent enqueue when policy enables local control.
- [ ] InputPlumber resolution remains a preflight failure path (`input-unavailable` / `input-ambiguous`), not renderer logic.
- [ ] The `-platform wayland` Gamescope `exposeWayland` argv sniff is removed and replaced with pre-spawn validation requiring sibling Gamescope expose-Wayland policy when needed.
- [ ] Tests cover minimal rendering, full typed rendering, structured touch bounds serialization, env set/unset, local-control env, input failure paths, intent env preservation, host URL errors, and no dependency on `KORRI_MOONLIGHT_*` env readers.

## Related

- `docs/plans/2026-06-08-002-feat-typed-moonlight-policy-api-plan.md`
- `product/apps/portal/api/stream/compose-moonlight-launch-spec.ts`
- `product/apps/portal/stream/moonlight-launcher.ts`
- `product/apps/portal/api/library/launch.rpc-handler.ts`
- `product/services/device/game-stream-launch-intent.ts`
- `product/platform/library/launcher.ts`
- `product/platform/stream/gamescope-launch-spec.ts`

## Notes

Agentic Chunk B from the plan. Covers U3 and U4. Prerequisite: Chunk A should be landed. Coordinate with `docs/plans/2026-06-08-001-feat-typed-gamescope-policy-api-plan.md` U1-U4 because Gamescope policy shape and the Moonlight call sites overlap. `Korri Stream`, `stream`, injected host, and InputPlumber-required product launches are invariants, not public policy. Update/delete any tests or callers that relied on `appName` overrides.
