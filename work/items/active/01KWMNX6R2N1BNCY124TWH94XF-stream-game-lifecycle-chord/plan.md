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

## Phase 0 — hold-to-quit (NO overlay, NO intercept)
Ships the safety win with pure logic. Holding needs no navigation.

- **P0.1 — hold-timing supervisor. ✅ DONE** (`chord-hold-supervisor.ts`, commit `348b909a`).
- **P0.2 — wire hold-to-fire into inputd. ✅ DONE** (commit `50082d52`).
  - `kill-current-game` chord → supervisor `engage`; required-control release →
    `release`; `fired` → existing kill; `tap` → no-op. `killHoldMs`=2000, injectable
    timers. Tests: quick press does NOT kill; hold ≥2000 ms kills once; early release
    cancels. 26/26 inputd tests green.
- **P0.3 — decoupling (already holds; confirm on device).**
  - The kill action terminates the active *sessiond launch*. On a stream the
    foreground launch is Moonlight, so a hold **closes the stream and leaves the
    remote game running** (observed orphan) — the safe "close stream" default.
  - Incidental stream-ends (client death, lid, crash, restart) already never signal
    the source to stop; no client→source stop path exists → decoupling holds by
    construction. No code change.

**Scope correction:** a *blind* 2 s hold must not silently kill the remote game — that
choice (close stream vs close game) needs the decision menu, so remote force-quit and
the short-chord-detach move to **Phase 1**. Phase 0 = hold-closes-foreground
(local game dies; stream closes, remote lives). Complete with P0.1 + P0.2.

Phase 0 acceptance: incidental disconnects leave the remote game running; a quick
press never quits; a 2 s hold closes the foreground (local game or stream).

---

## Phase 1 — decision surface (overlay + intercept nav)

### Progress (branch feat/decision-overlay)
Logic core + adapters built and tested (531/531 device+input tests green):
- DONE overlay-intercept.ts — intercept controller (gate + ui_* -> nav), 6 tests
- DONE overlay-menu.ts — menu model + local/stream option composition, 6 tests
- DONE overlay-orchestrator.ts — press/progress ring, fired quit, tap menu -> action, 8 tests
- DONE overlay-renderer/renderer.c + package.nix — native layer-shell renderer (ring+menu), compiles (~37 KB)
- DONE overlay-renderer-client.ts — protocol encoders + lazy-spawn process client, 6 tests
- DONE overlay-intercept-live.ts — busctl + gdbus port, parser tested, 5 tests

Remaining integration (device-coupled):
- [ ] Concrete Bun.spawn glue: InterceptSubprocess + RendererProcessSpawner (real processes).
- [ ] inputd wiring: construct the orchestrator with live ports + actions (forceQuit = existing kill; closeRemoteGame = source stop) + sessionKind provider; route the hold supervisor onUpdate into orchestrator.onHoldUpdate (replacing the Phase 0 fired-only path).
- [ ] Flake/image: expose korri-overlay-renderer; put the renderer + busctl + gdbus on inputd PATH; give inputd the compositor wayland env (WAYLAND_DISPLAY/XDG_RUNTIME_DIR); set KORRI_OVERLAY_RENDERER_BIN.
- [ ] Deploy to Bandai (note: the korri-scout-release-scan runaway, 01KWN0HSZV, blocks activation — stop it mid-switch) + by-eye validation.
- [ ] sessionKind detection (local vs stream); first cut may default to local.
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
- **P1.5 — actions wired to choices (incl. remote force-quit, moved from P0).**
  - close stream (terminate local Moonlight, remote lives) / close game on source
    (client → source `app.session.stop`; Moonlight+gamescope collapse as a side
    effect) / keep playing. Local: "Quit game" / "Keep playing".
  - Open question #1 (dispatch owner: inputd intent vs stream-client) applies here.
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

---

## Session update — four reported issues (scoping, touch, stream instant-kill, double-press)

Live on Bandai (closure `7s77isbf`, inputd `ikgw7gp8`, korrid carries the moonlight
quit-disable env, moonlight-embedded rebuilt with patch 0014). All on trunk.

### Shipped
- **Session scoping** (was: overlay armed on the hub). inputd polls a session probe
  (`overlay-session-state{,-live}.ts`: sessiond managed-launch status + a `/proc` scan
  for a moonlight client) and only engages the quit chord when a game/stream session is
  active. Orchestrator tears down any in-flight ring/menu if the session ends mid-gesture.
  The probe also classifies local vs stream so the menu shows the right options.
- **Touch on the menu** (`renderer.c` + `overlay-renderer-client`/`overlay-live-processes`
  + orchestrator `onTouchSelect`). Renderer binds `wl_seat`/`wl_touch`, claims an input
  region only while a menu is shown (empty otherwise → taps fall through to the game),
  hit-tests a tap against the option rects, and reports `touch <i>`/`touch-cancel` on
  stdout; inputd treats a tap as absolute select-and-confirm. Works on hub + local.
- **Stream instant-kill fixed** (Moonlight vendor patch 0014 + `composeMoonlightLaunchSpec`
  env). Moonlight-embedded's `QUIT_BUTTONS` == our exact chord (Start+Select+L1+R1) and
  quit with no hold. Patch gates it behind `KORRI_MOONLIGHT_DISABLE_GAMEPAD_QUIT`, always
  set on the device stream launch path. Hold-to-quit now runs; the chord no longer tears
  the stream down instantly.
- **Double-press fix** (`overlay-orchestrator`): draw the menu only after InterceptMode 2
  is confirmed. Enabling intercept spawns a busctl round-trip (~100–300ms); drawing the
  menu first let a fast accept press race that window and leak to the pad.

### Determined — no code needed for stream touch
Bandai's stream policy passes only the InputPlumber virtual gamepad to Moonlight's
`-input`; moonlight-embedded disables udev auto-grab when `-input` is given, so Moonlight
never EVIOCGRABs the ft5x06 panels (event4/event5). The compositor keeps them, so the
Push A `wl_touch` renderer should receive touch during a stream (Spike B proved the
overlay renders above the fullscreen stream). No Moonlight input-suspend surgery needed.

### Pending device validation (backlog 01KWNHE95J) — needs hands
1. Stream touch works by finger on a live stream. If not: `fuser /dev/input/event4,event5`
   during a stream to confirm grabs, then implement Moonlight `input.suspend/resume`.
2. Single accept press registers (no double-press) on local + stream. If it persists:
   InputPlumber first-event-drop on 0→2; prime via `CompositeDevice0.SendEvent`, or adopt
   `SetInterceptActivation`.
