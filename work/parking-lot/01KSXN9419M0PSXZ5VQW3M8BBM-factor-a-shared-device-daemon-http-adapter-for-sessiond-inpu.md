---
id: 01KSXN9419M0PSXZ5VQW3M8BBM
slug: factor-a-shared-device-daemon-http-adapter-for-sessiond-inpu
title: Factor a shared device-daemon HTTP adapter for sessiond/inputd/input-bridge
origin: parked
legacy: task-079
status: To Do
priority: medium
labels:
  - architecture
  - refactor
  - device-daemons
  - sessiond
  - inputd
  - http
created: 2026-05-31
source: se-architecture-improvement
context:
---

# Factor a shared device-daemon HTTP adapter for sessiond/inputd/input-bridge

## Why it matters

Three Korri device daemons — `sessiond`, `inputd`, `input-bridge` — each hand-roll the same `Bun.serve` shape: pathname/method routing ladder, bearer-token-header auth gate, JSON serialization helpers, JSON-decode-with-400 wrapper, and SIGTERM/SIGINT main. Sessiond carries a load-bearing comment about `idleTimeout: 0` being the SSE safety net; that rationale is daemon-local but the policy is daemon-wide and silently re-decided every time a new daemon is added. The consumer side already uses Hono and the shared `@shared/api/rpc/*` helpers, so the routing primitive is in the closure. Concentrating the pattern would shrink sessiond's ~200-line `handleRequest` ladder to a route table, make each daemon's behavior directly unit-testable without standing up Bun.serve, and lower the bar to add a new daemon (a future renderer- or status-daemon).

## Acceptance Criteria

- [ ] A shared device-daemon HTTP adapter (Hono on Bun, or a thin `createDeviceDaemon` wrapper) concentrates: token-header verification with consistent 401 mapping, JSON-decode-with-400, the SSE-friendly idle-timeout default, port/hostname resolution, and SIGTERM/SIGINT shutdown.
- [ ] `tools/device/sessiond.ts` is migrated first: `handleRequest` becomes a route table; the unauthenticated `GET /status` and the token-gated routes share one auth seam; the SSE idle-timeout rationale lives in the adapter rather than `startKorriSessiond`.
- [ ] `tools/device/inputd.ts` and `tools/device/input-bridge.ts` are migrated after sessiond, preserving WS upgrade semantics and existing wire behavior.
- [ ] Route handlers are directly unit-testable without standing up `Bun.serve`, matching today's `createKorriSessiondCore` testability for the other two daemons.
- [ ] Operator-visible behavior (paths, methods, status codes, SSE heartbeats, WS upgrade headers, signal handling) is preserved; coverage on each daemon does not regress.
- [ ] No `Mock*` / `Stub*` / `Fake*` doubles are introduced for the adapter or its consumers.

## Related

- `tools/device/sessiond.ts`
- `tools/device/inputd.ts`
- `tools/device/input-bridge.ts`
- `tools/http/server.ts`
- `korri/shared/api/rpc`
- `docs/solutions/runtime-errors/sessiond-sse-stream-killed-by-bun-idle-timeout-2026-05-27.md`
- `./01KSV2WD0T87V30MBFS706EAGJ-extract-sessiond-managed-launch-supervisor.md`
- `./01KSRGFP0QWX9JYGWKT400YGPC-cover-sessiond-ts-managed-launch-http-sse-surface.md`

## Notes

Earns its name only by landing on at least two daemons — one-daemon-only is a shallow wrapper. Phase per-daemon: sessiond first (highest payoff from `handleRequest` shrinkage; pairs naturally with task-042's supervisor extraction since both touch the same file), then inputd, then input-bridge. If a new daemon-shaped service appears (live-USB status, renderer-d, telemetry) before this lands, fold it in then. Sequence after task-042 so the supervisor seam is in place before the routing layer is reshuffled around it.
