---
id: 01KZ6QB5A612V82PJ47M2YZQ7S
slug: audit-shift-port-against-legacy-interaction-infrastructure
title: Audit Shift port against legacy interaction infrastructure
origin: parked
status: To Do
priority: high
labels:
  - shift
  - parity
  - input
created: 2026-08-04
source: user
context:
  cwd: /home/simonwjackson/code/sandbox/korri
  branch: main
  repo: korri
---

# Audit Shift port against legacy interaction infrastructure

## Why it matters

The Library scroll regression came from copying Shift's page components without porting the legacy focus engine's explicit post-focus scrolling. Other interactions may have the same hidden dependency on platform behavior even when the surface JSX looks literal.

## Acceptance Criteria

- [ ] Map every active Shift interaction to its legacy surface and platform implementation
- [ ] Add parity tests for focus movement, scrolling, focus restoration, modal scope, and route transitions
- [ ] Record intentional omissions explicitly instead of silently simplifying them
- [ ] Verify the resulting interaction paths on the RG405M

## Related

- `surfaces/shift/`
- `clients/portal/src/input/`
- `legacy:product/platform/browser/navigation/`
- `legacy:product/surfaces/web/shift/`

## Notes

Triggered by user feedback that the Library selector no longer scrolled the page. Root cause was omission of legacy focus-engine scrollIntoView behavior during the port.
