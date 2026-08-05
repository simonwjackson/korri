# Unified Android gameplay overlay — Moonlight parity gate

This document is the U6 characterization and parity inventory for the current
Artemis gameplay menu. The authoritative old implementation remains
`KorriGameOverlay.java` plus `overlay.html` until U8. The canonical declaration
is `plugins/moonlight/plugin.ts`.

Proof status meanings:

- **Repository proven** — an automated repository test pins the declaration,
  materialized value, executor operation, or lifecycle behavior.
- **Device blocked** — behavior still needs a live-stream/controller check in
  U8. Repository proof does not claim installed-device parity.

Every row below is device blocked until U8 exercises it over a live stream.
Repository proof now also covers the U6 review hardening: each `Game`
registration receives a random process-local executor generation; korrid signs
that generation and the exact executor, control declaration, value, and
dismissal policy into one-use instructions; Android rechecks the exact
executor object and generation on the `Game` UI thread. Same-`launchId`
replacement tests include delayed Disconnect and Quit instructions.

Before each overlay authority publication, Android asks the exact live
coordinator to republish values from `Game`. A failed publication withholds the
remote control list. After a stateful effect, publication failure does not
rewrite an already executed effect as retryable; korrid state is cleared until
a later fresh publication succeeds.

| R8 control | Old UI / bridge method or setting key | Canonical plugin control / effect | Form and exact options/range | Successful dismissal | New executor operation | Expected refresh | Proof status |
|---|---|---|---|---|---|---|---|
| Resume | `Resume`; guidance: `B / Back to resume · stream keeps running`; `resume()` | Overlay-owned `overlay:resume` (no plugin effect) | command | closes | local overlay dismissal | none | Repository proven: U5 local Resume; Device blocked |
| Screen fit | `Screen fit`; `isFillMode()` / `toggleFillMode()`; values `crop to fill`, `fit (letterbox)` | `@korri:moonlight/fill` / `@korri:moonlight/set-fill-mode` | toggle | stays open | `SetFillMode` | publish and reload resulting boolean | Repository proven: declaration and executor coverage; Device blocked |
| Toggle keyboard | `Toggle keyboard`; `toggleKeyboard()` | `@korri:moonlight/keyboard` / `@korri:moonlight/toggle-keyboard` | command | closes | `ToggleKeyboard` | none | Repository proven: declaration and executor coverage; Device blocked |
| Full keyboard | `Full keyboard`; `toggleFullKeyboard()` | `@korri:moonlight/full-keyboard` / `@korri:moonlight/toggle-full-keyboard` | command | closes | `ToggleFullKeyboard` | none | Repository proven: declaration and executor coverage; Device blocked |
| Pan & zoom | `Pan & zoom`; `isZoomMode()` / `toggleZoomMode()`; values `on`, `off` | `@korri:moonlight/pan-zoom` / `@korri:moonlight/set-zoom-mode` | toggle | closes | `SetZoomMode` | state publication occurs before close | Repository proven: declaration and executor coverage; Device blocked |
| Mouse mode | `Mouse mode`; `getMouseModes()` / `setMouseMode(index)` | `@korri:moonlight/mouse-mode` / `@korri:moonlight/set-mouse-mode` | choice: `0` **Multi touch**; `1` **Absolute touch**; `2` **Track pad(Natural/Double tap to drag)**; `3` **Track pad(Gaming/Long press to drag)**; `4` **Disabled**; `5` **Absolute touch (left/right click swapped)** | closes | `SetMouseMode` | state publication occurs before close | Repository proven: declaration and executor coverage; Device blocked |
| Local mouse cursor | old mouse sentinel `-1`; `Toggle local mouse cursor(physical mouse needed)`; `setMouseMode(-1)` | `@korri:moonlight/local-cursor` / `@korri:moonlight/set-local-cursor` | separate command; the `-1` sentinel does not cross the plugin contract | closes | `SetLocalCursor` | state publication occurs before close | Repository proven: declaration and executor coverage; Device blocked |
| Rotate screen | `Rotate screen`; `rotateScreen()` | `@korri:moonlight/rotate-screen` / `@korri:moonlight/rotate-screen` | command | closes | `RotateScreen` | none | Repository proven: declaration and executor coverage; Device blocked |
| Toggle HUD | `Toggle HUD`; `toggleHud()` | `@korri:moonlight/hud` / `@korri:moonlight/toggle-hud` | command | closes | `ToggleHud` | none | Repository proven: declaration and executor coverage; Device blocked |
| Floating menu button | `Floating menu button`; `toggleFloatingButton()` | `@korri:moonlight/floating-menu` / `@korri:moonlight/toggle-floating-menu` | command | closes | `ToggleFloatingMenu` | none | Repository proven: declaration and executor coverage; Device blocked |
| Keyboard as controller | `Keyboard as controller`; `toggleKeyboardController()` | `@korri:moonlight/keyboard-controller` / `@korri:moonlight/toggle-keyboard-controller` | command | closes | `ToggleKeyboardController` | none | Repository proven: declaration and executor coverage; Device blocked |
| Touch sensitivity | `Touch sensitivity`; `switchTouchSensitivity()` | `@korri:moonlight/touch-sensitivity` / `@korri:moonlight/switch-touch-sensitivity` | command | closes | `SwitchTouchSensitivity` | none | Repository proven: declaration and executor coverage; Device blocked |
| SGSR sharpness | `SGSR sharpness`; `seekbar_sgsr_sharpness`; `setSetting()` | `@korri:moonlight/sgsr-sharpness` / `@korri:moonlight/set-sgsr-sharpness` | range `0..50`, step `1` | stays open | `SetSgsrSharpness` | publish and reload resulting integer | Repository proven: declaration and executor coverage; Device blocked |
| SGSR edge threshold | `SGSR edge threshold`; `seekbar_sgsr_edge_threshold`; `setSetting()` | `@korri:moonlight/sgsr-edge-threshold` / `@korri:moonlight/set-sgsr-edge-threshold` | range `1..32`, step `1` | stays open | `SetSgsrEdgeThreshold` | publish and reload resulting integer | Repository proven: declaration and executor coverage; Device blocked |
| Flip A/B and X/Y | `Flip A/B and X/Y`; `checkbox_flip_face_buttons`; `setSetting()` | `@korri:moonlight/face-button-flip` / `@korri:moonlight/set-face-button-flip` | toggle | stays open | `SetFaceButtonFlip` | publish and reload resulting boolean | Repository proven: declaration and executor coverage; Device blocked |
| Rumble | `Rumble`; `checkbox_enable_rumble`; `setSetting()` | `@korri:moonlight/rumble` / `@korri:moonlight/set-rumble` | toggle | stays open | `SetRumble` | publish and reload resulting boolean | Repository proven: declaration and executor coverage; Device blocked |
| Picture-in-picture | `Picture-in-picture`; `checkbox_enable_pip`; `setSetting()` | `@korri:moonlight/picture-in-picture` / `@korri:moonlight/set-picture-in-picture` | toggle | stays open | `SetPictureInPicture` | publish and reload resulting boolean | Repository proven: declaration and executor coverage; Device blocked |
| Disconnect | `Disconnect`; guidance: `game keeps running`; `disconnect()` | `@korri:moonlight/disconnect` / `@korri:moonlight/disconnect` | command | closes | `Disconnect` | none; current graceful return lifecycle continues | Repository proven: declaration and executor coverage; Device blocked |
| Quit game on host | `Quit game on host`; `quitSession()`; confirmation title `Really want to quit?`; confirmation guidance `Please make sure you have no unsaved progress. Quitting the session will terminate your current running application.` | `@korri:moonlight/quit-host` / `@korri:moonlight/quit-host` | destructive command | closes before the existing confirmation path | `QuitHost` | none; confirmed quit retains `quitOnStop` host termination | Repository proven: declaration and executor coverage; Device blocked |

## Availability and ordering policy (R5)

Session controls are ordered by declaration `order`, then plugin-local id;
duplicate order values for one route contributor and values outside the
unsigned 16-bit declaration range are rejected. The canonical Moonlight order
is exactly the table above, with Disconnect and then Quit terminal. The 18-row
order and Screen fit's declaration-owned `crop to fill` / `fit (letterbox)`
labels are repository-pinned; undeclared toggle labels materialize as `On` /
`Off`.

Availability is per effect, not per executor. `Game` reports platform and live
object constraints, and each state getter is isolated. An unavailable or
throwing effect is omitted from materialized controls while healthy effects
remain. This is the R5 policy: do not fail the entire executor and do not show
a control that the current `Game` cannot execute.

For every signed declaration with `dismissOnSuccess`, the accessibility service
transactionally hides its window, removes focus/touch ownership, and returns
focus to the underlying `Game` before executor dispatch while retaining the
WebView/message channel. Success is reported before normal portal dismissal
destroys the window; rejection or execution failure restores the same window.
The old in-Activity overlay remains present until U8.

## Input and lifecycle gate

The global focused accessibility-overlay window must translate stick and hat
edges to semantic `direction` events and consume controller motion while it is
visible. Only `ACTION_MOVE` mutates navigation edges; other joystick-class
actions are consumed without navigation. Neutral motion resets the relevant
edge. Start's semantic `menu` action dismisses the sheet like the old overlay.
It must not synthesize key
codes into JavaScript. Repository tests can pin translation and consumption;
RG405M stick/hat routing remains **Device blocked**.

`KorriSessionOverlay` remains the pre-stream owner. Its stage-starting,
stage-complete, connected, failed, and terminated JSON bytes are a regression
contract. U6 must not move or rename that event vocabulary.

## U8 acceptance evidence rules and current status

**Current status (2026-08-05): pre-cutover, device proof pending.** Repository
coverage proves the global host, exact launch scoping, semantic input adapter,
control materialization, and native executors. A process-local current-service
request seam now routes `Game`'s floating button, performance HUD, five-finger,
Back, and controller triggers to the exact armed global session. Stale,
replacement, foreground-mismatched, and direct cases fail closed. An absent
service is reported distinctly as unavailable; only that result may use the
clearly marked temporary old-host fallback.

This is not installed-device parity. `KorriGameOverlay.java` and
`overlay.html` intentionally remain until the device gate passes. The cutover
contract test is still in its pre-cutover state and must be flipped only in the
later removal change.

Acceptance evidence follows these rules:

- Every screenshot has a same-label sidecar containing only machine observations:
  explicit device serial/model, top activity, relevant PIDs, read-only
  accessibility state, dumpsys overlay-window state, actual RPC responses, and
  structured `KorriOverlay` / `KorriGameLifecycle` records. Handwritten
  telemetry and checkpoint answers are never evidence.
- A screenshot never proves moving stream frames, input ownership, a native
  menu transition, host survival, or permission recovery by itself. Those are
  named human checkpoints.
- Guide, D-pad, A/confirm, B/Back, and supported stick/hat checks use the
  physical controller. `adb input` cannot stand in for hardware routing or
  host observation. The separate automated RetroArch gate may bounds-tap an
  exact, focus-proven installed Library tile through Android's normal pointer
  UI, but that does not satisfy or replace the unified-overlay physical
  controller confirm checkpoint.
- Local and stream positives require an exact active `launchId` and controls
  response. Direct-launch and unrelated-app negatives require the expected top
  package plus absence of the Korri overlay window.
- Permission checks inspect Android's accessibility state but never write it.
  The user owns disable/re-enable actions in Settings, including any restricted
  settings step Android actually exposes. An RG405M running Android 14
  measurably lost the enabled service after Korri was force-stopped on
  2026-08-05, so neither acceptance gate may force-stop, kill, install,
  uninstall, clear, or restart Korri after the grant is required.
- The gate locks and backs up mutable config, RetroArch save/state, and Artemis
  preferences before mutation. The preferences copy is read-only diagnostic
  evidence, never a restoration mechanism. Before beginning, every preference
  key that a reversible control may write must already be materialized; absent
  defaults are not safely reversible. The complete typed SharedPreferences map
  (file/key presence plus string, string-set, boolean, int, long, and float
  values) must be byte-identical after semantic normalization. Korri remains
  running and the gate never overwrites preferences. Every reversible gameplay
  control is restored through its product action. Cleanup closes only launch IDs
  and emulator PIDs recorded by this gate; a replacement causes cleanup refusal
  and retention of the backup and lock.
- Connection-loss proof requires `KORRI_STREAM_CONNECTION_LOSS_PROBE` to name an
  executable deterministic command/probe. Without it the gate exits pending
  before device mutation. Host stop on the current Zao path must return the
  actual `SessionStopUnsupported` RPC error while the exact stream survives;
  the gate then performs and proves a separate exact Disconnect.

The gate is:

```sh
KORRI_STREAM_CONNECTION_LOSS_PROBE=/path/to/approved-probe \
  nix run .#overlay-accept -- <adb-serial> <exact-device-model> \
    <direct-launch-package> <unrelated-package> [evidence-dir]
```

A successful script run records evidence for review; it does not by itself
change this document to “passed” or authorize cutover.

## U8 device checklist

- Exercise all nineteen rows above over a live stream.
- Confirm every nondismissing control reloads the displayed resulting value.
- Confirm Disconnect returns to Korri while the host application keeps running.
- Reconnect, then confirm Quit game on host uses the existing confirmation and
  terminates the host application only after confirmation.
- Confirm D-pad and supported stick/hat navigation reach the focused global
  sheet and no motion/button input reaches the remote host while it is open.
- Confirm connection loss still reattaches the pre-stream lifecycle view with
  unchanged narration.
