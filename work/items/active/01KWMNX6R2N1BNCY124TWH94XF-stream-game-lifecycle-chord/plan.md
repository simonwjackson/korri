# Stream/Game Lifecycle Chord — Implementation Plan (Phase 0 + Phase 1)

Backlog: `01KWMNX6R2N1BNCY124TWH94XF` · General overlay follow-up: `01KWMQ7DXZCQJCH4ENTYYB9N1J`
Branch: `feat/chord-hold-supervisor`

## Goal
Split the fused "stream ends = game dies" behaviour into two independent things —
**the stream** (the local view/connection) and **the game** (the process on the
source). Incidental stream-ends never kill the game; only a deliberate act does.
Deliver a hold-to-quit force signal (Phase 0) and a controller-navigable decision
surface (Phase 1) that works over local games and streams alike.

## Non-goals (deferred)
- Surface-authored overlays / the general overlay resolver (`01KWMQ7DXZ`) — keep
  only the abstract seam.
- Per-game suspend/freeze of the remote game.
- A dim full-screen scrim (costs a full-screen buffer; skip for the minimal floor).

## Validated foundation (proven live on Bandai — do not re-litigate)
| Claim | Evidence |
|---|---|
| Overlay stacks over a live gamescope stream | mako + native client on `layer=overlay` rendered over Moonlight |
| Controller spatially navigates the overlay | `ui_left/right/up/down/accept/back` captured; selection moved live |
| Game input is gated during the overlay | emulated pad `event10`: 38 events (off) → 0 (on); DBus channel 0 → 34 |
| korri can drive intercept | `SetInterceptMode` write OK as korri (no root); `PropertiesChanged`/`InputEvent` received |
| Native renderer footprint | ~5 MB RSS (C + Cairo + shm), vs ~40 MB GTK/Python, vs hundreds for web |
| Hold-timing primitive | `chord-hold-supervisor.ts` — 10/10 tests green (slice P0.1, landed) |

Key facts:
- Chord = `L1+R1+Start+Select` (`kill-current-game`, `inputd.ts` DEFAULT_SHORTCUTS), fires instantly today.
- InputPlumber DBus: `CompositeDevice0` `InterceptMode` (writable), events on
  `/org/shadowblip/InputPlumber/devices/target/dbus0` `InputEvent (s,d)` as `ui_*` + press/release (1.0/0.0).
- Moonlight reads the InputPlumber **virtual** pad; nothing reads the raw controller.
- `grim` cannot screenshot over an active stream → on-device verification is by-eye.
- Hold duration default: **2000 ms**.

## Architecture
```
controller → InputPlumber → virtual pad → game / Moonlight
                 │
                 └→ inputd (BRAIN): chord → hold-supervisor
                        ├─ fired → force-quit action
                        └─ tap   → overlay-request → intercept ON,
                                    read ui_*, drive selection,
                                    push {progress, menu, selected} → renderer (DUMB view)
```
- **inputd** owns input and orchestration. **Renderer** never reads the controller.
- **Intercept** gates the game while the overlay is up (proven).
- **Force-quit**: local → kill the foreground game; stream → tell the source to stop
  (existing `app.session.stop`), and Moonlight+gamescope collapse as a side effect
  (do NOT orchestrate teardown).

---

## Phase 0 — hold-to-quit + decoupling (NO overlay, NO intercept)
Ships the safety win with pure logic. Holding needs no navigation.

- **P0.1 — hold-timing supervisor. ✅ DONE** (`chord-hold-supervisor.ts`, commit `348b909a`).
- **P0.2 — wire hold-to-fire into inputd (local).**
  - Feed the `kill-current-game` chord into the supervisor: on chord match →
    `engage`; on any required-control release → `release`; on `fired` → dispatch the
    existing kill; `tap` → no-op (Phase 0).
  - Files: `product/services/device/inputd.ts` (+ `inputd.test.ts`).
  - Test-first: quick press does NOT kill; holding ≥2000 ms kills exactly once;
    releasing before threshold cancels.
  - Risk: existing tests assume instant kill — update them; behaviour change on device.
- **P0.3 — decoupling guard.**
  - Guarantee incidental stream-end (Moonlight client death, lid, crash, restart)
    does NOT stop the remote game. Largely already true (orphan) — codify + test.
  - Files: client stream teardown path (`product/apps/portal/stream/moonlight-launcher.ts`
    / sessiond client role) + a regression test asserting no source-stop on client exit.
- **P0.4 — force-quit on a stream (deliberate teardown).**
  - When the foreground is a stream, `fired` calls the source's `app.session.stop`
    (client → source), then local Moonlight collapses as a side effect.
  - Decision needed: does inputd dispatch this, or does it hand off to the stream
    client that holds the source address? (see Open Questions).
- **P0.5 — short-chord placeholder.**
  - Until the decision menu exists, a quick chord during a stream detaches the local
    stream and leaves the remote game running (design's interim "close stream").

Phase 0 acceptance: incidental disconnects leave the game running; a 2 s hold is the
only thing that stops a game (local kill or remote stop); quick press never nukes.

---

## Phase 1 — decision surface (overlay + intercept nav)
- **P1.1 — native renderer component.**
  - Promote the validated C layer-shell client to a real package: `overlay` layer,
    shm/software, content-sized surface, allocate-on-show. Dumb view driven over a
    socket: `{show ring at N%}`, `{show menu [options], highlight i}`, `{hide}`.
  - Session-scoped lifecycle: spawn on game/stream launch, kill on return-to-hub
    (0 MB in hub, ~5 MB in game). Owner: sessiond or a small `korri-overlay` unit
    (decide in P1.1).
  - New derivation + image wiring.
- **P1.2 — InputPlumber intercept client (module).**
  - `setInterceptMode(2/0)` + subscribe `dbus0 InputEvent` → typed `ui_*` stream.
    ~50 lines; unit-testable with a fake bus.
- **P1.3 — inputd orchestration (tap path).**
  - On `tap`: emit overlay-request → intercept ON → read `ui_*` → move selection →
    push to renderer. On `accept` → run action. On `back`/timeout → close, intercept OFF.
- **P1.4 — hold ring feedback.**
  - Wire supervisor `progress` → renderer ring (the filling countdown). Spawn/show
    renderer on chord `press`, not just tap.
- **P1.5 — actions wired to choices.**
  - close stream (detach, game lives) / close game (P0.4 force-quit) / keep playing.
  - Verbiage: local = "Quit game" / "Keep playing"; stream = "Close stream" /
    "Close game on aka" / "Keep playing".
- **P1.6 — abstract overlay-request seam.**
  - inputd emits an "overlay request"; a trivial resolver routes to the floor renderer
    today (future: offer active web surface first). Keeps `01KWMQ7DXZ` additive.

Phase 1 acceptance: tap → styled decision over any surface; stick/d-pad moves the
selection while the game is gated; accept runs the choice; renderer never reads the pad;
in-hub footprint 0, in-game ~5 MB.

## Open questions / decisions
1. **Force-quit dispatch on streams** — inputd vs. the stream client that knows the
   source address + stop RPC. Leaning: inputd emits an intent; the client role executes.
2. **Renderer owner/lifecycle** — sessiond-spawned vs. a dedicated `korri-overlay`
   user unit. Leaning: sessiond spawns it per game session.
3. **inputd ↔ renderer IPC** — reuse inputd's existing socket protocol vs. a new small
   one. Decide in P1.1.
4. **Renderer draw** — keep Cairo (~5 MB) or hand-rolled pixels (~2–3 MB). Cairo for now.

## Sequencing
P0.2 → P0.3 → P0.4/P0.5 (ship Phase 0, validate on device by-eye) →
P1.1 → P1.2 → P1.3/P1.4 → P1.5 → P1.6.

## Verification
Unit tests (`bun:test`) for supervisor, inputd wiring, intercept client. On-device:
by-eye (grim can't capture over a stream) — hold shows ring + quits; tap shows menu;
nav moves selection; game gated; incidental disconnect leaves game running.
