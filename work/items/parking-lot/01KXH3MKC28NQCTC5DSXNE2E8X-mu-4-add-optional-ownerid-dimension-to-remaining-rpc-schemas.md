---
id: 01KXH3MKC28NQCTC5DSXNE2E8X
slug: mu-4-add-optional-ownerid-dimension-to-remaining-rpc-schemas
title: "MU-4: Add optional ownerId dimension to remaining RPC schemas"
origin: parked
status: To Do
priority: medium
labels:
  - multi-user
  - rpc
  - schema
created: 2026-07-14
source: user
---

# MU-4: Add optional ownerId dimension to remaining RPC schemas

## Why it matters

userId penetrates launch and stream-prepare but stops at session, plugin-install, and stream-control RPCs. Wire schemas are the hardest thing to change after clients proliferate, so add the owner dimension now as optional and promote to required later.

## Acceptance Criteria

- [ ] ownerId: Schema.optionalKey(Schema.String) added to app.session.*, app.plugin.install.*, app.stream-control.* payloads
- [ ] Inline comment notes .extend()-to-required migration path
- [ ] optionalKey vs optional encoding verified identical across client and server
- [ ] No breaking change for callers that omit the field

## Related

- `product/apps/portal/api/session/status.rpc.ts`
- `product/apps/portal/api/plugin-install/request.rpc.ts`
- `product/apps/portal/api/stream-control`

## Notes

Do not duplicate userId as a payload field where CurrentPrincipal already resolves it; ownerId is for cross-boundary payloads only.
