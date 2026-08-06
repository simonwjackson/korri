# Overlay over a stream — historical spike and provisional production status

> **Historical observation:** This records a 2026-07-31
> `spike/korri-overlay` experiment over a Skate 3 stream from zao. It was a
> direct human observation, not instrumented acceptance evidence.
>
> **Current status:** Korri now hosts the unified sheet in a focused
> `TYPE_ACCESSIBILITY_OVERLAY`, with launch-scoped controls and an authenticated
> process-local Moonlight executor. Repository coverage is green, but U8
> installed-device proof remains pending. Stream parity has not been claimed.

## What the spike answered

The user showed and hid a global overlay while live Skate 3 frames were visible.
The stream survived the overlay taking focus. This established that one global
window could plausibly cover both a local game and Artemis video rather than
requiring a transport-specific presentation surface.

Evidence provenance limits that conclusion. The probe searched for the wrong
streaming Activity and saw none. Screenshots were byte-identical to an earlier
blank capture; another attempt produced black frames. Those captures could not
prove either overlay visibility or stream survival. The result was the user's
direct observation only.

The run also exposed environmental costs: a sleeping phone, two displays, and a
missing accessibility grant each invalidated attempts without testing the
architecture. Opening Settings or producing an image is not proof of the
requested behavior.

## What changed since the spike

The current streaming Activity is `com.limelight.Game`. Korri publishes an
exact Android launch identity and live executor generation, materializes the
Moonlight control inventory through korrid, and renders it in the same Shift
surface used for local sessions. `KorriOverlayService` owns the focused
`TYPE_ACCESSIBILITY_OVERLAY`; the old broadcast probe is not present in the
production request path.

The pre-stream connection/progress/failure lifecycle remains
`KorriSessionOverlay` inside `Game`. Moving the running-game menu does not move
or rename that lifecycle contract.

## Evidence rules for the pending U8 gate

A stream screenshot is supporting evidence only. Each retained image must have
a same-label sidecar containing the exact model/serial, top activity, relevant
PIDs, accessibility state, overlay-window dump, active controls, and available
session/RetroArch telemetry. A human must additionally observe moving host
frames before and after the sheet, physical controller routing, Disconnect
leaving the host game alive, reconnect, and host Quit terminating it.

The production gate is `nix run .#overlay-accept -- <serial> <exact-model>
<exact-hardware-serial> <direct-package> <unrelated-package>`. It must pass
local, stream, negative, and permission checkpoints and restore device state.
Until that evidence is reviewed, the historical “stream survived” result remains provisional and does
not permit deleting the old gameplay host.
