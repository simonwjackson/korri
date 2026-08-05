# Owning the Guide button — historical spike and provisional production status

> **Historical measurement:** The hardware observations below were collected on
> 2026-07-30 from the `spike/korri-overlay` branch on an SM-F966U1 running
> Android 16 with a Nacon MG-X. They informed the current architecture but are
> not U8 acceptance evidence.
>
> **Current status:** The production implementation now uses a focused
> `TYPE_ACCESSIBILITY_OVERLAY` window owned by `KorriOverlayService`. Repository
> tests cover scoping and input translation. Installed-device U8 proof is still
> pending, so this document does not claim parity or authorize removal of the
> in-activity overlay.

## What the spike established

The accessibility service was configured with filtered key events and
`TYPE_WINDOW_STATE_CHANGED`, without interactive-window retrieval. It observed
foreground package and class changes and received `KEYCODE_BUTTON_MODE` while a
local game held focus. Consuming both Guide halves prevented Android from
sending the user Home. A `TYPE_ACCESSIBILITY_OVERLAY` drew over the live game
without a separate “display over other apps” grant.

The spike measured the game continuing to present frames while both focusable
and non-focusable overlays were present. The SurfaceFlinger latency buffer was
already at its 127-frame ceiling, so the observation rules out a full pause but
does not quantify an unchanged frame rate. CPU burn, `gfxinfo`, and an input
layer mistaken for the GL surface all produced misleading intermediate
measurements; only the real BLAST SurfaceView was useful.

The accessibility grant disappeared repeatedly during early work. A later app
update preserved it, correcting the initial attribution to reinstall. Writes to
`enabled_accessibility_services` / `accessibility_enabled` were one demonstrated
hazard. On 2026-08-05, the RG405M running Android 14 also measurably lost the
user-owned Korri accessibility-service grant when Korri was force-stopped.
Acceptance tooling must therefore leave the granted Korri process alive: no
force-stop, process kill, install, uninstall, clear, or automated restart is a
valid setup or cleanup action. Product and acceptance tooling read secure
settings only; Android Settings remains the user-owned grant path.

## What changed since the spike

The spike's broadcast-triggered probe is historical and is not a production
control path. Current production architecture is:

- `KorriOverlayService` owns the only global window, a focused
  `TYPE_ACCESSIBILITY_OVERLAY` WebView with the narrow overlay bridge.
- Guide, D-pad, confirm, Back/B, menu/options, and stick/hat edges become
  semantic overlay input at the Android edge. Web content never receives
  hardware key codes.
- A process-local current-service seam accepts show/dismiss requests only for
  the exact armed `launchId` and matching foreground. It is main-thread
  marshalled, rejects stale or mismatched scope, and exposes no receiver or
  other command IPC.
- Accessibility loss is visible in Korri and must not prevent launching content.

## U8 proof still required

The SM-F966U1/MG-X spike is provisional for the RG405M gate. Before cutover,
`nix run .#overlay-accept -- <serial> <exact-model> <direct-package>
<unrelated-package>` must record paired evidence for a Korri local RetroArch
session, a live Moonlight stream, direct-launch and unrelated-app negatives,
and human-owned permission loss/recovery. Physical Guide, D-pad, A, B/Back,
and supported stick/hat behavior must be observed; adb input is not a
substitute. Until that gate passes, `KorriGameOverlay` and `overlay.html` remain
pre-cutover fallback fixtures.
