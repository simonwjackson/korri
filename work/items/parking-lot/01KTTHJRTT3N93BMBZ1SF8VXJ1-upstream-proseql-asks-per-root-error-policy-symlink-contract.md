---
id: 01KTTHJRTT3N93BMBZ1SF8VXJ1
slug: upstream-proseql-asks-per-root-error-policy-symlink-contract
title: "Upstream ProseQL asks: per-root error policy, symlink contract, transform meta"
origin: parked
status: To Do
priority: medium
labels:
  - proseql
  - config
  - upstream
  - follow-up
created: 2026-06-11
source: se-work
---

# Upstream ProseQL asks: per-root error policy, symlink contract, transform meta

## Why it matters

ProseQL 0.15 landed per-root collections, onFragmentError, provenance, and diagnostics, but three gaps remain. (1) onFragmentError is per-source, so Korri cannot express "fail for trusted roots, skip for removable cards" — we adopted skip-fragment globally (user-approved), meaning a trusted-root typo now degrades per-fragment instead of freezing last-known-good; per-root policy would restore the stricter trusted posture. (2) Symlink handling is incidental, not contractual: 0.15's listRecursive happens to never list symlink entries (closing the escape vector at discovery), but it is undocumented behavior our security posture now leans on — ask upstream to document/test it (or add explicit followSymlinks/containment config); Korri keeps a defense-in-depth realpath guard in the transform meanwhile. (3) Per-root meta passthrough into DocumentGraphTransformContext would delete Korri's parallel rootId maps.

## Acceptance Criteria

- [ ] Upstream issues/PRs filed (or implemented) for per-root onFragmentError, documented symlink discovery contract, and transform context meta
- [ ] Korri adopts per-root error policy when available: trusted roots fail-fast, removable roots skip-fragment
- [ ] Defense-in-depth realpath guard re-evaluated once the symlink contract is documented upstream

## Related

- `product/platform/library/proseql/config-graph-db.ts`
