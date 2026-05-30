---
id: task-038
title: Decide fate of orphaned foreground-session-status CLI tool
status: To Do
priority: low
labels:
  - dead-code
  - cleanup
  - foreground-session
  - cli
created: 2026-05-29
source: se-work
context:
  cwd: .
  branch: refactor/foreground-session-snapshot-removal
  repo: simonwjackson/korri
  invoked_by: se-work
---

# Decide fate of orphaned foreground-session-status CLI tool

## Context

`tools/cli/foreground-session-status.ts` is a Bun CLI that GETs the deleted `/__korri/desktop/foreground-session-status` route and decodes the JSON via `decodeForegroundSessionStatusSnapshot`. The route was removed in task-012 ("sessiond canonical lifecycle source"); the legacy bridge endpoint test in `tools/desktop/desktop-smoke.test.ts` actively asserts the route no longer serves JSON.

Surfaced during task-035 (SEC-002) while auditing dead code around the snapshot module: the CLI is the same defect *class* as the deleted snapshot module — a dangling consumer of an endpoint that no longer exists — but a *different failure mode* (HTTP 404 / fetch failure, not information disclosure). Folding it into task-035 would have violated the "do exactly what was asked, no bonus refactors" boundary.

Today the CLI:
- Targets a default URL (`http://127.0.0.1:3000/__korri/desktop/foreground-session-status`) that returns 404.
- Has full test coverage (`foreground-session-status.test.ts` — 6 tests) using injected fetch, so the tests pass without exercising the real endpoint.
- Has a top-level `process.exit(...)` runner (line 97) suggesting it was meant to be a CLI binary, but is not wired into `package.json`'s `bin` field, `justfile`, or any documented operator runbook.

## Why it matters

Dead CLI tools with green test suites are worse than broken ones: an operator who finds the file or runs it via `bun tools/cli/foreground-session-status.ts` discovers the 404 only at runtime, by which point they've assumed the tool was real. The tests reinforce the illusion because they all pass.

Three acceptable resolutions:
1. **Delete the CLI + tests** (parallel to task-035's snapshot deletion). Simplest, removes the trap.
2. **Retarget to `app.server.status` over `/api/rpc`** — same data path the renderer's atom uses today (post-task-012). This re-establishes the CLI as a useful operator diagnostic and aligns it with the post-sweep `sessiond-operator-model-2026-05-29.md` doc.
3. **Keep, wire into `justfile` as `just sessiond-status` or similar**, and update the default URL. Requires deciding the operator surface.

## Acceptance Criteria

- [ ] Pick one of {delete, retarget to `app.server.status`, keep and wire}.
- [ ] If delete: drop `tools/cli/foreground-session-status.ts` + `tools/cli/foreground-session-status.test.ts`; verify no `package.json` `bin` entry or `justfile` recipe references them.
- [ ] If retarget: rewrite the CLI to call the `app.server.status` RPC at `/api/rpc` (mirror `foreground-session-status-layer-live.ts`'s request shape); update tests; update the default URL.
- [ ] If keep: add a `justfile` recipe + a one-liner in `docs/solutions/architecture-patterns/sessiond-operator-model-2026-05-29.md` operator diagnostics section.

## Related

- `tools/cli/foreground-session-status.ts`
- `tools/cli/foreground-session-status.test.ts`
- `korri/products/app/features/home/foreground-session-status-layer-live.ts` (the live RPC consumer shape)
- `tools/desktop/desktop-smoke.test.ts` (asserts the legacy endpoint is gone)
- `docs/solutions/architecture-patterns/sessiond-operator-model-2026-05-29.md` (would gain a CLI hook if option 3 is chosen)
- backlog/task-035 - audit-foreground-session-snapshot-recentevents-state-leak.md (sibling cleanup)

## Notes

Captured during task-035 implementation. The CLI's tests pass via injected fetch and so do not surface the 404 — it is fully functional in test land and fully broken in production. Defer until an operator actually wants the diagnostic; until then, "delete" is the safest default.
