---
title: Ryubing on SM8550 needs Turnip >= 26.x and OpenAL audio, not nixpkgs defaults
date: 2026-06-11
category: performance-issues
module: ryubing packaging + SM8550 device runtime
problem_type: performance_issue
component: emulation
symptoms:
  - Switch games emulate but stutter badly; Ryujinx logs "GPU processing thread is too slow, waiting on CPU..."
  - Audio drifts 3-4 seconds behind video and never recovers, even when the game later runs at full speed.
  - Clock pinning (GPU 680 MHz performance, CPU clusters at hw max) helps but does not fix either symptom.
root_cause: dependency_version
resolution_type: config_change
severity: high
tags: [sm8550, adreno-740, turnip, mesa, ryujinx, ryubing, openal, sdl2, audio-latency, korri]
---

# Ryubing on SM8550 needs Turnip >= 26.x and OpenAL audio, not nixpkgs defaults

## Problem

On bandai (AYN Odin 2 Portal, SM8550 / Adreno 740, NixOS guest on ROCKNIX),
Switch titles under Nix-built Ryubing 1.3.3 stuttered hard and carried a
permanent multi-second audio lag, despite all CPU clusters at hardware max
and the GPU devfreq pinned to 680 MHz performance.

## Root causes (two distinct ones)

### 1. Turnip 25.2.6 (nixpkgs default) is pathologically slow for Ryujinx on A740

This re-confirms the 2026-05-10 nix-on-rocks finding ("Nix Mesa/Freedreno is
the Ryujinx culprit: same Ryujinx goes from 60 FPS to 4 FPS when forced onto
Nix Mesa 25.2.6" / "ROCKNIX Mesa [26.0.6] passthrough ... returns to 60 FPS").
The effect is a Turnip **version** effect, not ROCKNIX tuning: current ROCKNIX
builds vanilla unpatched Mesa. The diagnostic signature of the slow driver is
Ryujinx spamming:

```
GPU processing thread is too slow, waiting on CPU...
```

Note the asymmetry: **Cemu does not care** — the 2026-05-09 Cemu audit found
driver parity between 25.2.6 and 26.0.6 and promoted Nix Mesa; Cemu's lever
was power policy. Do not generalize emulator perf conclusions across
emulators.

### 2. Ryujinx's SDL2 audio backend accumulates an undrainable queue

Whenever emulation runs sub-realtime for a stretch (boot, shader compile,
slow GPU), the SDL2 backend queues samples and never drops them: latency
sticks at whatever was accumulated (3-4 s observed) for the rest of the
session. Switching `audio_backend` to `OpenAl` removed the lag entirely and
measurably improved FPS (queue churn + emulated audio-service backpressure
also cost frame time).

## Fix applied on device (runtime/config, 2026-06-11)

1. Mesa 26.1.2 from nixos-unstable copied into the guest store
   (cache hit on aarch64: `nix build github:NixOS/nixpkgs/nixos-unstable#mesa`),
   GC-rooted, and injected via the Switch app env in the device config:

   ```yaml
   env:
     VK_ICD_FILENAMES: /nix/store/<mesa-26.1.2>/share/vulkan/icd.d/freedreno_icd.aarch64.json
   ```

   Verified in the Ryujinx log: `Driver v26.1.2` (was `v25.2.6`). User
   verdict: "gpu is great now."

2. `"audio_backend": "OpenAl"` in the card's `Config.json`
   (openal-soft is already in the ryubing wrapper's library path). User
   verdict: audio lag gone, FPS up.

3. Clock persistence via ROCKNIX settings (`system.gpuperf=performance`,
   `system.cpugovernor=performance`) so `008-perfmode` reapplies on boot and
   `rocknix-fake-suspend` restores `performance` after suspend/resume instead
   of reverting to `simple_ondemand`.

## Durable work this implies

- Build/wrap the `ryubing` package against Mesa >= 26.x Turnip (scoped mesa
  override or nixpkgs bump) instead of the env-var injection.
- Make `OpenAl` the default audio backend for ryubing on SM8550 (typed
  `audio` policy group in `kind: ryubing` is the natural home once the
  audio-only/visibility issue is fixed).
- Untested remaining lever from the May spike: thread affinity
  (`taskset 0xF8` onto the big/prime cores).

## When to apply

- Any Adreno (Turnip) device running Ryujinx/Ryubing from nixpkgs where the
  "GPU processing thread is too slow" warning appears.
- Any Ryujinx deployment where audio lag persists after performance
  recovers: check `audio_backend` before touching PipeWire/Pulse.
