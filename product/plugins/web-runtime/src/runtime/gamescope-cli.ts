// Builds nested gamescope argv for a web run.
//
// The web runtime spawns gamescope itself (self-contained) rather than relying on
// an external wrapper, because the internal resolution depends on the game's
// native render size, which for detect-mode engines is only known after probing
// the live page. `--force-windows-fullscreen` fullscreens the X11 (Xwayland)
// Chromium window; `-S fit -F pixel` gives aspect-preserving sharp upscaling.

import type { WebCompositorRequest } from "../core/gamescope-request"

export function gamescopeCliArgs(request: WebCompositorRequest): string[] {
  return [
    "--backend",
    "wayland",
    "-W",
    String(request.output.width),
    "-H",
    String(request.output.height),
    "-w",
    String(request.internal.width),
    "-h",
    String(request.internal.height),
    "-r",
    String(request.refresh ?? 60),
    "-S",
    "fit",
    "-F",
    request.filter,
    "-f",
    "--force-windows-fullscreen",
  ]
}
