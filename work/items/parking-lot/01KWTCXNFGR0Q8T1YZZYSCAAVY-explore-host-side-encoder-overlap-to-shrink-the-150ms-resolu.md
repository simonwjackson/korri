---
id: 01KWTCXNFGR0Q8T1YZZYSCAAVY
slug: explore-host-side-encoder-overlap-to-shrink-the-150ms-resolu
title: Explore host-side encoder-overlap to shrink the ~150ms resolution-switch host gap
origin: parked
status: To Do
priority: low
labels:
  - streaming
  - sunshine
  - vaapi
  - resolution
  - performance
  - seamlessness
  - research
  - host-side
created: 2026-07-06
source: user
---

# Explore host-side encoder-overlap to shrink the ~150ms resolution-switch host gap

## Why it matters

On-device measurement (2026-07-05) proved live resolution switching is host-bound: a 720->540 switch froze for ~212ms total, of which ~150ms (71%) is the host (aka/Sunshine) tearing down and rebuilding its VAAPI encoder for the new size, sending nothing while the client holds the last frame. The client pipeline is only ~62ms and its dominant ~38ms decoder reopen is load-bearing for correctness (patch 0010), so no client work can make switching seamless. aka's Sunshine already carries the existing host-gap optimizations (patches 0012 persist-config + reinit-capture, 0013 async-capture-reinit, 0014 skip-vaapi-destructor-flush, from e2da35f1/a0b8aa91), so ~150ms is the already-optimized floor -- there is no quick patch left. Cutting it further is the only path to a truly seamless (sub-perceptible) resolution change, which matters because resolution is otherwise stuck as a last-resort adaptive lever (bitrate/FPS are the seamless dials). This is a genuine exploration/research item, not a bug fix: it may or may not be worth the complexity, and the fallback (resolution as last-resort with strong hysteresis) is already the confirmed design.

## Acceptance Criteria

- [ ] Prototype and measure the dominant cost inside the 150ms host gap (VAAPI encoder session teardown+realloc vs capture re-derivation vs first-IDR encode) with a host-side stamp analogous to KORRI_RESW_TRACE, so the 150ms is decomposed the way the client side already is.
- [ ] Evaluate encoder-overlap: keep the old-resolution encoder producing frames while the new-size encoder/capture spins up, then cut over frame-accurately (double-encode/overlap) so the client never holds a frozen frame -- prototype feasibility on VAAPI/radeonsi and measure the residual gap.
- [ ] Evaluate a materially faster VAAPI re-init path (reuse encoder context / surfaces across a resolution change instead of full teardown) as a cheaper alternative to overlap.
- [ ] Decide, with numbers, whether any approach gets the perceived freeze under ~a few frames (~50ms) -- the seamless threshold -- and whether the complexity is worth it versus keeping resolution as the last-resort lever.
- [ ] If not pursued, record the negative result so the last-resort-lever decision stays evidence-backed.

## Related

- `docs/korri-stream-resolution-switch-seamlessness-findings-2026-07-05.md`
- `01KWR2SP6DJ56E7SFYPJXGZX3E`
- `product/vendor/sunshine-korri/patches/0012-persist-runtime-config-and-reinit-capture-after-resolution.patch`
- `product/vendor/sunshine-korri/patches/0013-request-async-capture-reinit-after-runtime-resolution.patch`
- `product/platform/stream/stream-adaptive-controller.ts`
- `01KSXN94148T4616TA79KHQD9T`
