---
id: 01KXH3JJJWBB68ZYK11NQG22E1
slug: mu-1-add-current-user-resolution-seam-currentprincipal-servi
title: "MU-1: Add current-user resolution seam (CurrentPrincipal service + RpcMiddleware)"
origin: parked
status: To Do
priority: high
labels:
  - multi-user
  - effect
  - rpc
  - foundation
created: 2026-07-14
source: user
---

# MU-1: Add current-user resolution seam (CurrentPrincipal service + RpcMiddleware)

## Why it matters

Nothing in the request lifecycle resolves "who is the current user". This is the single blocking gap for multi-user readiness — until it exists, the userId fields already on launch/stream-prepare RPC payloads are dead weight because callers have nothing to put in them. Cloning the existing FeatureGatesMiddleware/InstallControlMiddleware shape makes this a copy-the-pattern job, not net-new architecture.

## Acceptance Criteria

- [ ] Context.Service<CurrentPrincipal, PrincipalInfo>()("CurrentPrincipal") added under product/platform
- [ ] PrincipalMiddleware provides: CurrentPrincipal and removes it from handler R, mirroring existing middleware
- [ ] Default resolves to userId: "default"; handlers read via yield* CurrentPrincipal with no payload duplication
- [ ] Test wiring uses Layer.succeed(CurrentPrincipal, …); no Mock*/Stub*/Fake*

## Related

- `product/platform/gates/middleware.ts`
- `product/apps/portal/api/plugin-install/install-control-authorization.ts`
- `product/apps/portal/api/server/rpc-group.ts`
- `work/parking-lot/01KSRGFP074RDRTVJ584FHN90A-multi-user-support.md`

## Notes

v4 caveat: FiberRef is removed. Use Context.Service (required, fails typed when absent) server-side; Context.Reference only for ambient/anonymous-ok surfaces. Typed UnauthorizedError via Schema.TaggedErrorClass.
