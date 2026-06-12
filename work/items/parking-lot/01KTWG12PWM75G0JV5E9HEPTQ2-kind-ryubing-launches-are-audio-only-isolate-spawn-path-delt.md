---
id: 01KTWG12PWM75G0JV5E9HEPTQ2
slug: kind-ryubing-launches-are-audio-only-isolate-spawn-path-delt
title: "kind:ryubing launches are audio-only; isolate spawn-path delta vs kind:process"
origin: parked
status: To Do
priority: high
labels:
  - ryubing
  - gamescope
  - launch
  - app-materializer
created: 2026-06-11
source: se-debug
---

# kind:ryubing launches are audio-only; isolate spawn-path delta vs kind:process

## Why it matters

On-device bisection (bandai 2026-06-11) eliminated the obvious suspects: kind: process with the EXACT ryubing argv (--no-gui --root-data-dir <card>/.config/Ryujinx --use-main-config <game>) is visible and playable in gamescope via the GUI launch flow, while kind: ryubing with the same command/args/DISPLAY is audio-only (game runs, window never surfaces). All shared-infrastructure causes are already fixed (card ReadWritePaths, memcg cap, DISPLAY in env, zombie processes). Remaining deltas exclusive to the ryubing kind: (1) env composition — materializer's resolvedContextEnv + RyubingPolicy env passthrough drops XDG_DATA_HOME/XDG_CACHE_HOME and earlier dropped DISPLAY until manually configured, vs launchEnvironment's full process.env merge; (2) the materializer rewrites <state.root>/Config.json pre-launch (observed write at launch time; start_fullscreen/hide_cursor semantics unverified); (3) renderTypedHeadlessArgs/composeRyubingLaunchSpec may interact with foreground-session window association differently. User hypothesis to test first: the typed kind may need explicit display config — e.g. display.fullscreen: true rendering --fullscreen — i.e. hyper-specific policy values where kind: process inherited Ryujinx defaults. Device is reverted to the working process-kind block; both ryubing attempts preserved at /root/korri-config-backups/local.korri.yaml.ryubing-kind-{paused,attempt2}.

## Acceptance Criteria

- [ ] Reproduce audio-only with kind: ryubing, then flip exactly one delta at a time: (a) add display.fullscreen: true, (b) diff the materializer-written Config.json against the process-kind run's Config.json, (c) snapshot child env both kinds and diff
- [ ] Root cause identified with a one-line statement of which delta hides the window
- [ ] Fix lands in ryubing-launch-spec/app-materializer (or documented required policy fields) with regression test
- [ ] kind: ryubing launch on bandai shows the game on screen via the normal GUI flow

## Related

- `product/platform/stream/ryubing-launch-spec.ts`
- `product/platform/library/config/app-materializer.ts`
- `product/platform/library/launcher.ts`
- `backlog 01KTWBZ682N52GTAS7AMCYBFR6`
- `backlog 01KTWFP9B8KTGJ38DYZHM0M2XJ`
