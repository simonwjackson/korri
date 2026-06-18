---
id: 01KVEFVQ7P67G20HW37090A6B6
slug: design-device-local-secret-storage-and-config-templating-for
title: Design device-local secret storage and config templating for provider credentials
origin: parked
status: To Do
priority: high
labels:
  - credentials
  - config
  - secrets
  - itchio
  - device-ux
created: 2026-06-18
source: user
context:
  cwd: .worktrees/feat/itchio-public-provider
  branch: feat/itchio-public-provider
  commit: 7768feca
  repo: simonwjackson/korri
---

# Design device-local secret storage and config templating for provider credentials

## Why it matters

The itch.io provider currently uses environment variables for API keys, which is acceptable for validation but not the desired long-term device UX. The user wants a future discussion about config templates plus a simple Unix-style password storage tool on-device.

## Acceptance Criteria

- [ ] Evaluate config templating patterns for provider credentials without committing secrets to config files or Nix/build artifacts.
- [ ] Compare simple Unixy secret storage options suitable for Korri devices, including file permissions, pass-like stores, age/sops-style encryption, keyring availability, and handheld constraints.
- [ ] Define how provider plugins receive secrets at runtime while preserving redaction and avoiding shell-history/log leakage.
- [ ] Document a recommended credential UX for itch.io and other store providers.

## Related

- `product/platform/acquisition/plugin-runtime.ts`
- `product/platform/acquisition/plugins/itchio.ts`
- `docs/acceptance/itchio-public-provider.md`
