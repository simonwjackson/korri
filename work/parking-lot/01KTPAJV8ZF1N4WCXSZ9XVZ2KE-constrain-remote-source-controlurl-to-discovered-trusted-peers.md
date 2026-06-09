---
id: 01KTPAJV8ZF1N4WCXSZ9XVZ2KE
slug: constrain-remote-source-controlurl-to-discovered-trusted-peers
title: "Constrain remote-source controlUrl to discovered trusted peers"
origin: parked
legacy: backlog/task-091
status: To Do
priority: high
labels:
  - "security"
  - "federation"
  - "rootless-korri-runtime"
created: 2026-06-09
source: se-code-review
---

# Constrain remote-source controlUrl to discovered trusted peers

## Why it matters

Security review found that app.library.launch can use a caller-supplied source.controlUrl. Even in trusted-LAN/no-auth v1, accepting arbitrary URLs risks SSRF-like requests or launches against unintended local/LAN services. The federation path should only target peers that korrid discovered or explicitly configured as trusted.

## Acceptance Criteria

- [ ] Remote-source launch rejects controlUrl values that are not associated with a discovered/configured trusted Korri peer.
- [ ] Loopback, link-local, file, and non-http(s) controlUrl inputs are covered by tests.
- [ ] Existing trusted-LAN federation happy paths still pass.

## Related

- `product/apps/portal/api/library/launch.rpc-handler.ts`
- `product/apps/portal/peers/peer-discovery.ts`

## Notes

Raised as SEC-F1 during rootless runtime implementation review.
