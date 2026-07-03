---
title: Converge fleet escape hatches onto settled LaunchOverrides
type: refactor
status: active
date: 2026-07-03
---

# Converge fleet escape hatches onto settled LaunchOverrides

Retire the per-plugin break-glass fields (Ryubing `extra.{args,config}`, Steam
`extra.args`, RetroArch `extraArgs`/`extraSettings`) in favor of the SETTLED
`release.launch.overrides.{args,config}` vocabulary proven end-to-end by the
RPCS3 settings-surface work. Authors get ONE escape-hatch surface; the merge
semantics live in shared platform helpers; per-plugin drift dies.

Origin: `item.md` (graduated from parking lot `01KWM7Q404…`).

## Progress

- Planned (see `plan.md`).
