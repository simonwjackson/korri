---
id: 01KXH3MKC8QFEASW1K9VAN61AA
slug: mu-12-auth-credentials-per-user-install-control-and-rbac
title: "MU-12: Auth credentials, per-user install-control, and RBAC"
origin: parked
status: To Do
priority: low
labels:
  - multi-user
  - security
  - auth
  - deferred
created: 2026-07-14
source: user
---

# MU-12: Auth credentials, per-user install-control, and RBAC

## Why it matters

Install-control is a single shared secret and there is no credential store or permission model. Real authentication and per-user authorization are deferred until users have meaningfully different access levels, but captured so the CurrentPrincipal seam can flip from "resolve default" to "authenticate" without wire changes.

## Acceptance Criteria

- [ ] Credential/session validation backs CurrentPrincipal resolution
- [ ] Install-control authorization becomes user-scoped
- [ ] Permission checks evaluated within the active user context
- [ ] No RPC wire schema change required to enable (owner dimension already present)

## Related

- `product/apps/portal/api/plugin-install/install-control-authorization.ts`
- `docs/solutions/architecture-patterns/physical-host-foreground-lifecycle-truth-is-sessiond-2026-05-29.md`

## Notes

Depends on MU-1/MU-4. Trigger: users need different access levels.
