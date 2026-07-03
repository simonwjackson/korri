---
id: 01KWK2VCP12PZQD4QBFX7DP02N
slug: fix-pre-existing-tsc-union-narrowing-error-in-rpcs3-discover
title: Fix pre-existing tsc union-narrowing error in rpcs3 discovery.test.ts
origin: parked
status: To Do
priority: low
labels:[]
created: 2026-07-03
source: se-work
---

# Fix pre-existing tsc union-narrowing error in rpcs3 discovery.test.ts

## Why it matters

`bun run typecheck` reports TS2339/TS7006 at product/plugins/rpcs3/src/discovery.test.ts:75,79 — `.map` is called on a `readonly ReleaseDiscoveryObservation[] | Effect<...>` union without narrowing. bun test passes (transpile-only), so runtime is green, but strict tsc fails. Pre-existing (file last touched by commit 7f0d4e68, before the settings-surface work); not introduced by the rpcs3 settings surface. Worth fixing so the plugin typechecks cleanly.
