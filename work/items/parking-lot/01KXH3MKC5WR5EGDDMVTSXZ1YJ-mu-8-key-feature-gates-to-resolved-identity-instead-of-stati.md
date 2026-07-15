---
id: 01KXH3MKC5WR5EGDDMVTSXZ1YJ
slug: mu-8-key-feature-gates-to-resolved-identity-instead-of-stati
title: "MU-8: Key feature gates to resolved identity instead of static \"local\""
origin: parked
status: To Do
priority: medium
labels:
  - multi-user
  - feature-gates
  - ui
created: 2026-07-14
source: user
---

# MU-8: Key feature gates to resolved identity instead of static "local"

## Why it matters

FeatureGatesProvider defaults userId to the static string "local" and it is never populated from a real identity. Keying gate state to the active user prevents gate state bleeding across future profiles.

## Acceptance Criteria

- [ ] FeatureGatesProvider userId sourced from CurrentPrincipal at the composition root
- [ ] localStorage key gates:${environment}:${userId} reflects the active user
- [ ] Behavior unchanged while principal is "default"

## Related

- `product/platform/react/gates/FeatureGatesProvider.tsx`

## Notes

Depends on MU-1. Non-sensitive local preference; localStorage is acceptable per storage-seam docs.
