---
id: task-078
title: Bind sessiond managed-launch client into one resolved interface
status: To Do
priority: low
labels:
  - architecture
  - refactor
  - sessiond
  - client-contract
created: 2026-05-31
source: se-architecture-improvement
context:
  cwd: .
  branch: trunk
  commit: 7a5ed3b
  repo: simonwjackson/korri
  invoked_by: se-architecture-improvement
---

# Bind sessiond managed-launch client into one resolved interface

## Why it matters

Task-043 landed the shared free-function module that consolidated token resolution, header naming, strict decode, and failure classification. The next deepening is binding the four functions plus the SSE observer into a single `SessiondClient` interface — `status()`, `start()`, `terminate()`, `observe()` — so consumers stop re-bundling `{url, token, fetchImpl, timeoutMs}` at every call site. `spawnViaSessiond` in `session-launcher.ts` currently threads those four fields eight times in one function. Token rotation, mTLS, or any future capability change still has to be wired through every consumer. The change is modest in code volume but compounds — every new sessiond consumer in the future picks up URL/token/fetch/timeout once instead of re-deriving them.

## Acceptance Criteria

- [ ] A `SessiondClient` interface exposes `status()`, `start(input)`, `terminate(input)`, and `observe(launchId)` and a `createSessiondClient(options)` / `createSessiondClientFromEnv(env)` resolves URL, token, fetch impl, timeout, and wire header naming once at construction.
- [ ] `korri/shared/library/session-launcher.ts` (and any other consumer added since task-043) holds one bound client per launcher instance instead of threading `{url, token, fetchImpl, timeoutMs}` at each call site.
- [ ] Existing failure mappings, capability checks, strict decode, redaction, and 401 / missing-token / unavailable / invalid-payload classification are preserved without behavior change on the wire.
- [ ] The four existing free functions in `sessiond-managed-launch-client.ts` and `sessiond-managed-launch-event-observer.ts` remain testable as primitives or become internal-only, whichever produces less consumer noise; no public consumer reaches around the client to call them.
- [ ] No `Mock*` / `Stub*` / `Fake*` doubles are introduced; harness clients use configurable behavior arguments and live beside the real implementation.

## Related

- `korri/shared/library/sessiond-managed-launch-client.ts`
- `korri/shared/library/sessiond-managed-launch-event-observer.ts`
- `korri/shared/library/session-launcher.ts`
- `korri/products/app/api/library/local-foreground-launch-adapter.ts`
- `korri/products/app/api/server/status.rpc-handler.ts`
- `backlog/task-043 - centralize-the-sessiond-managed-launch-client-contract.md`

## Notes

Successor follow-up to task-043, which centralized the wire surface but kept it as a free-function module with per-call option bags. This is intentionally low priority — task-043 already eliminated the drift risk. The motivation here is consumer locality and a smaller seam for future protocol additions (token rotation, capability negotiation). Skip if a near-term protocol change makes the rewrite cheaper to fold in then.
