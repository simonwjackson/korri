# Layer 3 — Safety Net: Scope

Status: scoping (2026-07-04). Foundation (Layer 2: accept-and-adapt) is built and
on both devices. This document scopes the next layer.

## Purpose

The safety net makes it safe for a **machine** to change stream settings
unattended. Once the adaptive controller (Layer 5) is firing bitrate/FPS/
resolution changes on its own, two failure modes must be impossible:

1. Two changes colliding (e.g. a bitrate change racing a resolution encoder
   rebuild).
2. A change that leaves the user on a frozen or black screen with no automatic
   way back — and worse, silently.

Layer 2 makes any computed value *land*. Layer 3 makes it *safe to try*.

## What already exists (do not rebuild)

- **Per-family in-flight latch** — `runtime_settings_mvp_has_inflight_family_locked`
  (moonlight patch `0005b`): blocks a second change of the *same* family.
- **Rate limiting** — `minCommandIntervalMs: 250` and
  `maxInFlightMutationsPerFamily: 1` (`product/platform/stream/moonlight-control-protocol.ts`).
- **Bounded timeout + honest failure** — a command that gets no terminal ack in
  the window reports `timed-out` / reason `no-ack`; the stream stays alive on the
  prior settings (contract §Timeouts, §Recovery).
- **Launch baseline** — bitrate/FPS/resolution recorded at launch; restore is a
  normal set command (contract §Capability, §Recovery).
- **Applied truth** — readback + state snapshot; `accepted` != `applied`.
- **The contract is already ahead of the code**: §Sequencing mandates a single
  global mutation queue and §Recovery mandates auto-revert to last known-good,
  recorded (never silent). Layer 3 implements what the contract already promises.

## The two gaps (units of work)

### U-A — Global one-at-a-time latch (cross-family) · `01KWN2KEGW61TJ54X13JP0BTZ2`

- **Problem**: the latch is per-family, so a bitrate change can race a resolution
  encoder rebuild. The contract mandates one mutation of *any* family in flight
  at a time.
- **Change**: promote the in-flight latch from per-family to global. A new
  mutation while any mutation is in flight is either rejected with `conflict` or
  briefly queued (see open question Q1).
- **Hard constraint**: must **not** block or deadlock the operation-0 capability
  query — it shares the send path, and startup capability learning must still
  complete.
- **Where/how**: native, in the `0005b` latch region; small change but the patch
  is coupled, so it goes through the **moonlight patch-export workflow** (dev
  checkout → regenerate stack), not a hand-edit.
- **Verification**: Nix invariant + a socket/client cross-family conflict test
  (machine). One device check: startup capability learning still completes
  (op-0 not starved) — piggybacks on any stream launch.
- **Risk**: low–medium. Mostly self-verifiable; only the op-0 non-deadlock needs
  the device.

### U-B — Frozen/black-screen watchdog with auto-revert · `01KWN2M3GSW2FQST7F3M7RX0V2` (task-100)

- **Problem**: a resolution change the host *applies* but the client can't
  *decode* strands the user on black. A passive timeout doesn't catch
  "applied-but-undecodable" — the ack says success.
- **Change**: an active detector. No decoded frames within a bounded window after
  a change → auto-revert to last known-good and record the revert in
  local-control state so it is observable (never silent), consumable by
  `korri stream` / runtime-watch.
- **Design questions (device-dependent)**:
  - **Signal for "no frames"**: decoder frame counter, presenter callback, or SDL
    present timestamps — pick the cheapest reliable source.
  - **Window + threshold**: must be tuned on real hardware; cannot be guessed.
    Long enough to not trip on normal renegotiation, short enough to rescue fast.
  - **Last known-good**: the last *applied* (readback-confirmed) settings, falling
    back to the launch baseline — never the last merely-*requested* value.
  - **Placement**: Korri-side recovery policy / client no-frames safety, **not**
    fork auto-adaptation (contract boundary: forks expose mechanism, Korri owns
    policy).
- **Verification**: unit-test the known-good bookkeeping, the revert path, and the
  recorded event (machine). One device session to induce a real frozen/black case
  and tune the window (genuinely needs a human + screen).
- **Risk**: medium–high. Inherently needs device signals; threshold tuning is the
  biggest unknown.

## Open questions to settle before/while building

- **Q1 — conflict policy**: on a cross-family collision, *reject with conflict* or
  *coalesce into a short queue*? For an autonomous controller, coalescing the
  newest intent may beat rejecting; rejecting is simpler and already the
  per-family behavior. Leaning: reject now, revisit queueing when Layer 5 exists.
- **Q2 — revert depth**: revert one step (to the immediately-prior applied state)
  or all the way to launch baseline? Leaning: prior-applied, baseline as fallback.
- **Q3 — watchdog scope**: resolution-only (the mode most likely to be
  undecodable) or all families? Leaning: arm on any change, since a bad bitrate/
  FPS can also stall decode.

## Sequencing

- **Do both in one moonlight patch-export checkout** — both are native and touch
  the same patch stack; a single dev-checkout avoids double patch churn.
- **U-A first**: it is largely machine-verifiable and its one device gate (op-0
  learning) is cheap.
- **U-B plumbing test-first, thresholds on device**: build the known-good
  bookkeeping + revert path + recorded event behind tests now; tune the window
  with the device in hand (pairs naturally with the Gate-A session).
- **Invariants preserved throughout**: input passthrough (already tested),
  applied-truth semantics, and the contract's never-silent rule.

## Human gates (kept minimal)

- U-A: one on-device confirmation that startup capability learning still works.
- U-B: one on-device session to induce and tune the frozen/black recovery.
- Everything else — latch logic, conflict handling, known-good bookkeeping, event
  recording, Nix invariants, socket tests — is machine-verifiable.

## Definition of done for Layer 3

- Global latch enforced; op-0 capability learning unaffected (device-confirmed).
- Watchdog auto-reverts a real frozen/black case within a tuned window and records
  the revert observably.
- Contract §Sequencing and §Recovery move from "mandated" to "implemented +
  verified."
- No regression to input passthrough or applied-truth.

## Related

- `docs/acceptance/runtime-settings-protocol-contract.md` (§Sequencing, §Recovery, §Timeouts)
- `product/vendor/moonlight-embedded-korri/patches/0005b-track-sunshine-runtime-settings-command-outcomes.patch`
- `product/platform/stream/moonlight-control-protocol.ts`
- `01KWN2KEGW61TJ54X13JP0BTZ2` (U-A), `01KWN2M3GSW2FQST7F3M7RX0V2` (U-B)
- `01KWN0KHT7CF3YXHWXTSCYMFNS` (in-session overlay — how a recorded revert surfaces to the player, later)
