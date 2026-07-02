/**
 * Shift library — the Reel hero caption (molecule).
 *
 * The centered title (and optional genre) beneath the wheel that names the
 * cover currently in the hero slot.
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export interface ShiftReelHeroProps {
  readonly title: string
  readonly genre?: string
}

export function ShiftReelHero({ title, genre }: ShiftReelHeroProps) {
  return (
    <div
      className="shift-lib-reel-hero"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.reelHero)}
    >
      <h1 className="shift-lib-reel-title">{title}</h1>
      {genre ? <p className="shift-lib-reel-tags">{genre}</p> : null}
    </div>
  )
}
