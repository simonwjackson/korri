/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 *
 * Pico's live workshop knobs, dropped into the generic gallery bar via
 * `config.workshopControls`. Rendered inside the bar so the existing
 * `.pico-gallerybar .pico-gallerybar-*` descendant styling applies unchanged:
 *
 *   72px · VIVID · ♪
 *
 * - px → cycle the runtime PICO-8 pixel granularity.
 * - VIVID/FLAT → toggle the runtime palette remap.
 * - ♪ → mute the 8-bit SFX.
 */
import { useState } from "react"
import {
  cycleGranularity,
  cyclePaletteMode,
  useGranularity,
  usePaletteMode,
} from "./pico-settings"
import { isMuted, sfx, toggleMuted } from "./pico-sfx"

export function PicoWorkshopControls() {
  const granularity = useGranularity()
  const palette = usePaletteMode()
  const [muted, setMuted] = useState(isMuted())

  return (
    <>
      <button
        type="button"
        className="pico-gallerybar-px"
        aria-label="cycle pixel granularity"
        title="pixel granularity (runtime PICO-8 remap)"
        onClick={() => {
          cycleGranularity()
          sfx.open()
        }}
      >
        {granularity}px
      </button>
      <button
        type="button"
        className={`pico-gallerybar-pal ${palette}`}
        aria-label="toggle palette mode"
        title="palette mode (flat vs vivid PICO-8 remap)"
        onClick={() => {
          cyclePaletteMode()
          sfx.open()
        }}
      >
        {palette.toUpperCase()}
      </button>
      <button
        type="button"
        className={`pico-gallerybar-mute ${muted ? "off" : ""}`}
        aria-label={muted ? "unmute" : "mute"}
        onClick={() => {
          const next = toggleMuted()
          setMuted(next)
          if (!next) sfx.confirm()
        }}
      >
        {muted ? "🔇" : "♪"}
      </button>
    </>
  )
}
