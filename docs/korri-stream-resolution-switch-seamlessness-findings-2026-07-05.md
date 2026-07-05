# Live resolution-switch seamlessness — findings & plan (2026-07-05)

Goal: make mid-session Moonlight resolution changes **virtually transparent** to
the viewer, or — if physics forbids — decide that resolution is the *last* lever
an adaptive controller should touch. Measured on-device (bandai client ↔ aka
host) using the `KORRI_RESW_TRACE` instrumentation (patches 0017 + 0018).

## Method

`KORRI_RESW_TRACE=/run/user/2000/korri-resw.trace` is set on `korri-sessiond`
(inherited by the spawned Moonlight). Each resolution switch appends microsecond
`CLOCK_MONOTONIC` stamps at pipeline stages. Baseline stream: 1280×720 @ 60fps,
7.3 Mbps, h264, v4l2m2m decoder, rtt 3–4 ms, 0% loss, 0 dropped frames.

Switches driven with `korri stream resolution <WxH>` (same-ratio 16:9 scaling
only; off-ratio and above-launch-ceiling requests are rejected).

## Measured data (client-side pipeline)

| Switch | decoder reopen | first-frame decode | presenter reset | **total (size-change→first-frame)** |
|---|---|---|---|---|
| 720→540 | 29.9 ms | 20.0 ms | 5.6 ms | **~50 ms** |
| 540→720 (up) | 33.6 ms | 41.7 ms | 8.4 ms | **~75 ms** |
| 720→360 (4× drop) | 32.1 ms | 31.0 ms | 11.4 ms | **~63 ms** |

10× rapid 360↔720 stress cycle (3 s apart): per-switch cost 62–99 ms, **zero
dropped frames, no crash, no drift, no latency growth**; final health rtt 3 ms /
0% loss. The variance (up to 99 ms) is host-side jitter, not client decay.

## Key findings

1. **The client-side switch is only ~50–100 ms** — a handful of frames, holding
   the last frame. The user "barely noticed" even the dramatic 720→360.
2. **The keyframe wait is NOT the bottleneck.** The host emits a fresh IDR
   promptly (first-frame decode 20–42 ms). Our original "frozen waiting for a
   keyframe" hypothesis was wrong.
3. **The decoder reopen is a fixed ~30–34 ms** regardless of jump size/direction
   — pure V4L2 decoder teardown+reopen.
4. **The ~30 ms decoder reopen is LOAD-BEARING, not waste.** Patch 0009 first
   handled the size change *in place* (accept new size + request IDR, no
   reopen). Patch 0010 **deliberately replaced** that with a full context reopen
   (`avcodec_free_context` + reopen) plus "skip the transition frame" and a
   `clone_display_frame` buffer copy — because on the iris FFmpeg-`v4l2m2m` path,
   continuing the same decoder context across a resolution change produces
   corrupt/misaligned frames. **Reverting to true in-place reconfig would
   re-introduce that corruption.** So "seamless by deleting the reopen" is off
   the table with the current FFmpeg-wrapper decoder.
5. **The perceived freeze can exceed the ~50–100 ms client pipeline** → the
   remainder is the **host gap**: aka/Sunshine rebuilding its encoder for the new
   size, during which it sends nothing and the client holds the last frame. Our
   trace could not see this (it starts at `size-change-detected`, i.e. when new
   frames *arrive*).

## Decisive next measurement (shipped, needs on-device capture)

Patch **0018** (`feat(moonlight): trace resolution command-received stage`) adds
a `command-received` stamp the instant Moonlight hands the request to the host,
on the same timeline as the decoder stamps. Then:

```
command-received → size-change-detected  =  HOST GAP (encoder reconfig + rtt)
size-change-detected → decoder-reopened  =  client decoder reopen (~30 ms)
decoder-reopened → first-frame-decoded   =  keyframe fetch + decode
first-frame-decoded → presenter-reset    =  presenter reset
```

This single number (host gap) decides whether seamlessness is even reachable
client-side.

### How to capture (on bandai's return)
1. Redeploy the client so Moonlight carries patch 0018 (already on trunk):
   `device_nixos_rebuild switch` for bandai (restart `korri-sessiond` so the new
   binary + `KORRI_RESW_TRACE` drop-in are live), then launch a stream.
2. `ssh bandai-guest-ip 'wc -l < /run/user/2000/korri-resw.trace'` (baseline).
3. `ssh bandai-guest-ip 'korri stream resolution 960x540'` (any same-ratio, ≤ launch res).
4. Read the new stamps; compute `size-change-detected − command-received` = host gap.

## Options ladder (choose after the host-gap number is known)

- **If host-bound (host gap ≫ client pipeline):**
  - Resolution is intrinsically the **last-resort lever**; use hysteresis and
    prefer bitrate/FPS. This is the pragmatic outcome.
  - Deploy trunk's Sunshine **host-gap patches to aka** (`0012-persist-runtime-config-and-reinit-capture-after-resolution`,
    `0013-request-async-capture-reinit-after-runtime-resolution`,
    `0014-skip-runtime-vaapi-destructor-flush`) and re-measure — these directly
    target the encoder-reconfig gap.
  - Perceptual masking: time resolution changes to **motion** (pans/action),
    where a 2–3-frame hold is invisible.

- **If client-bound (host gap small):** the reopen is load-bearing, so:
  - (big, needs device) Implement a proper **V4L2 `SOURCE_CHANGE` handler in the
    "Plan C" direct-V4L2 decoder path** (STREAMOFF capture → reallocate capture
    buffers for the new size → STREAMON) instead of a full device reopen. This is
    the only way to cut the ~30 ms *correctly*; it must be validated on the iris
    driver.
  - (small) Cache the DRM hwdevice (`av_hwdevice_ctx_create(renderD128)`) across
    reopens to shave the render-node open from each switch. Marginal.
  - Perceptual masking as above.

**Conclusion so far:** the switch is already near-transparent in motion
(~50–100 ms client-side, robust under stress). True zero-freeze fights physics
(keyframe) and the load-bearing reopen. The next real decision hinges entirely
on the host gap, which patch 0018 will reveal.

## Host (aka) status — action for operator
- aka Sunshine build `6zb4mnx3…-sunshine-korri-2025.924.154138-korri` is active,
  but HTTPS :47984 returned `000` on 2026-07-05 (possibly wedged again, as it was
  earlier — a `korri-sunshine.service` restart previously fixed it).
- **Run `just switch aka`** (from the system-config repo; that recipe is not in
  the korri repo/justfile) to deploy trunk's latest Sunshine — durable build +
  the host-gap patches above — and freshen the wedged service. This was not
  runnable from the coding-agent context (recipe unavailable there).

## Verification checklist (operator, on bandai's return)
- [ ] `just switch aka` — deploy trunk Sunshine; confirm `korri-sunshine.service`
      active and HTTPS :47984 responds (not `000`).
- [ ] Re-pair bandai ↔ aka if needed; start a stream.
- [ ] Redeploy bandai (trunk) so Moonlight carries patch 0018; confirm
      `korri stream show` healthy.
- [ ] Capture the host gap (steps above); record the number here.
- [ ] Decide host-bound vs client-bound; pick from the options ladder.
- [ ] (Sanity) confirm the sessiond self-heal still recovers home after a bad
      launch (the crash-recovery fix from earlier today).
