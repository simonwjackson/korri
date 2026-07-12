---
title: Launch hooks — before/after command primitives in readable config
type: feat
status: active
date: 2026-07-12
---

# Launch hooks — before/after command primitives in readable config

User-authored `before`/`after` command lists in Korri's readable YAML config
that run around game sessions: cascade-merged (host outermost), try/finally
semantics (after-hooks always run, even on crash/stop), `on-failure` policy on
before-hooks, launch-context env, and reusable named profiles via `hooks.use`.
Hooks execute raw commands as the session user — **no helper binaries**
(korri-perf/korri-fan explicitly dropped by user decision).

Motivating case: the Bandai/Wonder performance recipe (CPU 672/1171/1248 MHz,
GPU 220 MHz, 60 Hz display, fan profile) proved ~3x battery (8 W → 2.7 W) and
~35 °C cooler at locked 30 FPS — but was applied by hand over SSH and lost on
reboot.

## Progress

- **Captured** — parked as backlog item `01KXA6XD911EDDGXEXY3C87D0C` (see `item.md`).
- **Graduated + scope confirmed** — 2026-07-12. Raw commands only; helper
  binaries out of scope. Synthesis confirmed by user.
- **Plan DONE** — see `plan.md` (6 units, Standard). Key shape: `hooks` as an
  `InheritableLayer` field (follows `patches`/`argsAppend`); named profiles in
  a top-level `hooks:` section; resolved hooks travel on
  `SessiondManagedLaunchStartRequest` gated by `capabilities.launchHooks`;
  before-hooks run immediately pre-spawn, after-hooks in sessiond teardown
  (always-runs).
