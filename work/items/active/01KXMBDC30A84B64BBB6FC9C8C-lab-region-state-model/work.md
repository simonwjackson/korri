---
id: 01KXMBDC30A84B64BBB6FC9C8C
title: Model dev-lab state as regions (single | nested | multi)
status: done
created: 2026-06-26
source: se-plan
---

# Model dev-lab state as regions (single | nested | multi)

Replace the dev-lab's flat axis model (a per-axis string map with an `enabledWhen`
predicate for nesting) with an honest statechart shape: each screen is a small
**forest of regions** where a region is just a top-level (parentless) axis. Axes
gain a `kind` (`single` XOR | `multi` 0..n) and a structural `parent` link for
nesting, and the per-axis active value becomes a discriminated union. Migrate the
real Shift and Pico adapters onto it, surface one genuinely-real new Shift region
(the Foreground Session Gate, already wired in `entry.tsx` and given effect by
`launchActionStateFrom`), and delete the old flat model — build-forward, no
backwards compatibility. One big-bang change executed in sequence from the plan.
