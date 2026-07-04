---
id: 01KWN2M3GSW2FQST7F3M7RX0V2
slug: add-active-frozen-black-screen-watchdog-with-auto-revert-to-
title: Add active frozen/black-screen watchdog with auto-revert to last known-good
origin: parked
status: To Do
priority: high
labels:
  - runtime-settings
  - reliability
  - safety
  - task-100
  - device-validation
created: 2026-07-03
source: se-work
---

# Add active frozen/black-screen watchdog with auto-revert to last known-good

## Progress (2026-07-04): policy core landed test-first

The Korri-side decision core is implemented and unit-tested (commit 5551ca4f,
`product/platform/stream/runtime-recovery.ts`, 8 tests): known-good bookkeeping,
revert-on-stall, no-oscillation (isRevert guard), no spurious revert on pre-apply
rejections, and never-silent (every stall yields a revert or a record). It is a
pure I/O-free reducer over command outcomes — not an external poller.

Remaining, for the device session:

1. Native (client): decode-confirmed applied-truth for resolution — arm a
   first-frame timer on the decoder reopen (paths 0009/0010), emit `failed`
   (decode-stall) when no frame decodes in the window. This is the moonlight
   patch-export half and needs real decode signals.
2. Live wiring (supervisor): subscribe to the control socket, feed sent commands
   and runtime.commandResult outcomes into the reducer, and issue the reducer's
   revert action via the control client; surface record-unrecoverable.
3. Tune the single device-only constant: the first-frame wait window.

## Framing (2026-07-04, user-confirmed): decode-truth, not a watcher tool

This is NOT a watchdog process that watches other tools. Build it as in-client
decode-truth plus an ordinary revert command:

- Finish the definition of "applied" for resolution: applied means the host
  applied it AND the Moonlight client decoded a frame at the new size. The client
  reopens the decoder (paths 0009/0010) and watches its own decode loop for the
  first frame via a timer armed only during the change and cancelled the instant a
  frame decodes (a timeout, not a standing monitor). No frame in the window ->
  outcome `failed`, reason `decode-stall`, over the existing outcome/event
  channel.
- Revert is Korri policy: on decode-stall (or any failed/timed-out change) send a
  normal set command back to the last decode-confirmed known-good and record it
  (never silent).
- Explicit anti-pattern to reject: a separate process that polls
  `korri stream show` / runtime-watch, screen-captures, or infers "looks black"
  and issues commands. That is tools-watching-tools and cannot see decode state.
- The only device-tuned value is the first-frame wait window; that single constant
  is why this needs a device session, not a watching apparatus.

See `docs/korri-stream-layer3-safety-net-scope.md` (U-B) for the full framing.

## Why it matters

task-100. Phase-1 continuity guarantee: if a live change hangs, times out, or leaves a frozen/black screen, the system should auto-revert to the last known-good settings and record the revert (never silent). Today failed/timed-out changes already keep the stream alive on prior settings, and explicit baseline restore exists (Moonlight records launch baseline; restore = normal set commands). The missing piece is an active detector: a resolution change the host applies but the client can't decode strands the user on black. Building the detector (no-frames-after-change → revert) needs real device signals to tune thresholds and must respect the contract (recovery is Korri-side policy, not fork auto-adaptation). Slated to be built with Gate A device feedback.

## Acceptance Criteria

- [ ] A change that produces no decoded frames within a bounded window triggers an automatic revert to the last known-good settings.
- [ ] The revert is recorded in local-control state so it is observable (never silent), consumable by korri stream / runtime-watch.
- [ ] Watchdog thresholds validated on-device against a real frozen/black case.
- [ ] Recovery policy placement respects the contract (Korri-side or client no-frames safety, not fork auto-adaptation).

## Related

- `docs/acceptance/runtime-settings-protocol-contract.md`
- `work/parking-lot/01KT2T2J1VBF9ETG4A45D8WBPX-add-runtime-resolution-recovery-fallback.md`
- `01KWN0KHT7CF3YXHWXTSCYMFNS`
