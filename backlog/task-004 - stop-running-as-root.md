---
id: task-004
title: Stop running runtime services as root
status: To Do
priority: high
labels:
  - security
  - runtime
  - sessiond
created: 2026-05-29
source: user
---

# Stop using root

## Context

Runtime services (sessiond, renderer, portal, RPC API, device-side helpers) currently run as root on the device builds. Move them to a dedicated unprivileged user (or per-service users) with only the capabilities they actually need.

## Why it matters

Running as root is the dominant attack-surface and blast-radius risk on the device. It also blocks credible multi-user, sandboxing, and untrusted-content stories down the line. Fixing this once is much cheaper than retrofitting after more services land.

## Acceptance Criteria

- [ ] Catalogue every runtime service that currently runs as root and the capability/permission it actually needs (device nodes, paths, sockets, ports).
- [ ] Define the target user model (single `korri` user vs. per-service users) and document it in `docs/solutions/`.
- [ ] sessiond, renderer, portal, and the RPC API run as a non-root user on the device builds.
- [ ] SSH / portal / RPC sockets and `/flash` & `/storage` access work under the new user model without ad-hoc chmod hacks.
- [ ] Live-USB VM smoke and RockNix device smoke pass under the new user.

## Related

- `korri/deploy/*`
- `nix/modules/*`
- `nix/images/platforms/rocknix-sm8550.nix`
- `docs/solutions/best-practices/rocknix-guest-only-nix-deploy-2026-05-27.md`

## Notes

Likely needs a real plan (`se-plan`) before execution; capture here, do not start ad-hoc.
