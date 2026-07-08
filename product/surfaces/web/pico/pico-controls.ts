/**
 * pico surface.
 *
 * Pico's live workshop knobs, DECLARED as data (`WorkshopControl[]`) — the
 * workshop renders them with its own neutral chrome. Pico provides only the knob
 * + behavior; it no longer styles the bar (that's the workshop's job now).
 *
 *   px → cycle the runtime PICO-8 pixel granularity
 *   VIVID/FLAT → toggle the runtime palette remap
 *   ♪ / 🔇 → mute the 8-bit SFX
 */

import type { WorkshopControl } from "@simonwjackson/caliper"
import { useState } from "react"
import {
  cycleGranularity,
  cyclePaletteMode,
  useGranularity,
  usePaletteMode,
} from "./pico-settings"
import { isMuted, sfx, toggleMuted } from "./pico-sfx"

export function usePicoControls(): readonly WorkshopControl[] {
  const granularity = useGranularity()
  const palette = usePaletteMode()
  const [muted, setMuted] = useState(isMuted())

  return [
    {
      kind: "cycle",
      id: "granularity",
      value: `${granularity}px`,
      title: "pixel granularity (runtime PICO-8 remap)",
      onClick: () => {
        cycleGranularity()
        sfx.open()
      },
    },
    {
      kind: "cycle",
      id: "palette",
      value: palette.toUpperCase(),
      title: "palette mode (flat vs vivid PICO-8 remap)",
      onClick: () => {
        cyclePaletteMode()
        sfx.open()
      },
    },
    {
      kind: "toggle",
      id: "sound",
      label: muted ? "🔇" : "♪",
      value: !muted,
      title: muted ? "unmute" : "mute",
      onChange: () => {
        const next = toggleMuted()
        setMuted(next)
        if (!next) sfx.confirm()
      },
    },
  ]
}
