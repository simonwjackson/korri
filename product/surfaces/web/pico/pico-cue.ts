/**
 * pico surface.
 *
 * Pico's navigation sound, wired into the generic gallery via `config.onCue`.
 * The very first gated gesture fires the boot chime; afterwards each cue plays
 * its matching 8-bit blip. The view toggle ("toggle") plays the open blip
 * without arming the boot chime, matching the original direct `sfx.open()` call.
 */
import type { CueKind } from "@tools/theme-workshop"
import { sfx } from "./pico-sfx"

let booted = false

export function picoCue(kind: CueKind): void {
  if (kind === "toggle") {
    sfx.open()
    return
  }
  if (!booted) {
    booted = true
    sfx.boot()
    return
  }
  sfx[kind]()
}
