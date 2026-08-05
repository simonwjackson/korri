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

| R8 control | Old UI / bridge method or setting key | Canonical plugin control / effect | Form and exact options/range | Successful dismissal | New executor operation | Expected refresh | Proof status |
|---|---|---|---|---|---|---|---|
| Resume | `Resume`; guidance: `B / Back to resume · stream keeps running`; `resume()` | Overlay-owned `overlay:resume` (no plugin effect) | command | closes | local overlay dismissal | none | Repository proven: U5 local Resume; Device blocked |
| Screen fit | `Screen fit`; `isFillMode()` / `toggleFillMode()`; values `crop to fill`, `fit (letterbox)` | `@korri:moonlight/fill` / `@korri:moonlight/set-fill-mode` | toggle | stays open | `SetFillMode` | publish and reload resulting boolean | Device blocked |
| Toggle keyboard | `Toggle keyboard`; `toggleKeyboard()` | `@korri:moonlight/keyboard` / `@korri:moonlight/toggle-keyboard` | command | closes | `ToggleKeyboard` | none | Device blocked |
| Full keyboard | `Full keyboard`; `toggleFullKeyboard()` | `@korri:moonlight/full-keyboard` / `@korri:moonlight/toggle-full-keyboard` | command | closes | `ToggleFullKeyboard` | none | Device blocked |
| Pan & zoom | `Pan & zoom`; `isZoomMode()` / `toggleZoomMode()`; values `on`, `off` | `@korri:moonlight/pan-zoom` / `@korri:moonlight/set-zoom-mode` | toggle | closes | `SetZoomMode` | state publication occurs before close | Device blocked |
| Mouse mode | `Mouse mode`; `getMouseModes()` / `setMouseMode(index)` | `@korri:moonlight/mouse-mode` / `@korri:moonlight/set-mouse-mode` | choice: `0` **Multi touch**; `1` **Absolute touch**; `2` **Track pad(Natural/Double tap to drag)**; `3` **Track pad(Gaming/Long press to drag)**; `4` **Disabled**; `5` **Absolute touch (left/right click swapped)** | closes | `SetMouseMode` | state publication occurs before close | Device blocked |
| Local mouse cursor | old mouse sentinel `-1`; `Toggle local mouse cursor(physical mouse needed)`; `setMouseMode(-1)` | `@korri:moonlight/local-cursor` / `@korri:moonlight/set-local-cursor` | separate command; the `-1` sentinel does not cross the plugin contract | closes | `SetLocalCursor` | state publication occurs before close | Device blocked |
| Rotate screen | `Rotate screen`; `rotateScreen()` | `@korri:moonlight/rotate-screen` / `@korri:moonlight/rotate-screen` | command | closes | `RotateScreen` | none | Device blocked |
| Toggle HUD | `Toggle HUD`; `toggleHud()` | `@korri:moonlight/hud` / `@korri:moonlight/toggle-hud` | command | closes | `ToggleHud` | none | Device blocked |
| Floating menu button | `Floating menu button`; `toggleFloatingButton()` | `@korri:moonlight/floating-menu` / `@korri:moonlight/toggle-floating-menu` | command | closes | `ToggleFloatingMenu` | none | Device blocked |
| Keyboard as controller | `Keyboard as controller`; `toggleKeyboardController()` | `@korri:moonlight/keyboard-controller` / `@korri:moonlight/toggle-keyboard-controller` | command | closes | `ToggleKeyboardController` | none | Device blocked |
| Touch sensitivity | `Touch sensitivity`; `switchTouchSensitivity()` | `@korri:moonlight/touch-sensitivity` / `@korri:moonlight/switch-touch-sensitivity` | command | closes | `SwitchTouchSensitivity` | none | Device blocked |
| SGSR sharpness | `SGSR sharpness`; `seekbar_sgsr_sharpness`; `setSetting()` | `@korri:moonlight/sgsr-sharpness` / `@korri:moonlight/set-sgsr-sharpness` | range `0..50`, step `1` | stays open | `SetSgsrSharpness` | publish and reload resulting integer | Device blocked |
| SGSR edge threshold | `SGSR edge threshold`; `seekbar_sgsr_edge_threshold`; `setSetting()` | `@korri:moonlight/sgsr-edge-threshold` / `@korri:moonlight/set-sgsr-edge-threshold` | range `1..32`, step `1` | stays open | `SetSgsrEdgeThreshold` | publish and reload resulting integer | Device blocked |
| Flip A/B and X/Y | `Flip A/B and X/Y`; `checkbox_flip_face_buttons`; `setSetting()` | `@korri:moonlight/face-button-flip` / `@korri:moonlight/set-face-button-flip` | toggle | stays open | `SetFaceButtonFlip` | publish and reload resulting boolean | Device blocked |
| Rumble | `Rumble`; `checkbox_enable_rumble`; `setSetting()` | `@korri:moonlight/rumble` / `@korri:moonlight/set-rumble` | toggle | stays open | `SetRumble` | publish and reload resulting boolean | Device blocked |
| Picture-in-picture | `Picture-in-picture`; `checkbox_enable_pip`; `setSetting()` | `@korri:moonlight/picture-in-picture` / `@korri:moonlight/set-picture-in-picture` | toggle | stays open | `SetPictureInPicture` | publish and reload resulting boolean | Device blocked |
| Disconnect | `Disconnect`; guidance: `game keeps running`; `disconnect()` | `@korri:moonlight/disconnect` / `@korri:moonlight/disconnect` | command | closes | `Disconnect` | none; current graceful return lifecycle continues | Device blocked |
| Quit game on host | `Quit game on host`; `quitSession()`; confirmation title `Really want to quit?`; confirmation guidance `Please make sure you have no unsaved progress. Quitting the session will terminate your current running application.` | `@korri:moonlight/quit-host` / `@korri:moonlight/quit-host` | destructive command | closes before the existing confirmation path | `QuitHost` | none; confirmed quit retains `quitOnStop` host termination | Device blocked |

## Input and lifecycle gate

The global focused accessibility-overlay window must translate stick and hat
edges to semantic `direction` events and consume controller motion while it is
visible. Neutral motion resets the relevant edge. It must not synthesize key
codes into JavaScript. Repository tests can pin translation and consumption;
RG405M stick/hat routing remains **Device blocked**.

`KorriSessionOverlay` remains the pre-stream owner. Its stage-starting,
stage-complete, connected, failed, and terminated JSON bytes are a regression
contract. U6 must not move or rename that event vocabulary.

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
