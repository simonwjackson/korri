/**
 * Shift library — the Reel hero caption (molecule).
 *
 * The centered title (and optional genre) beneath the wheel that names the
 * cover currently in the hero slot.
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"
import { ShiftReelTags } from "./ShiftReelTags"
import { ShiftReelTitle } from "./ShiftReelTitle"

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
      <ShiftReelTitle title={title} />
      {genre ? <ShiftReelTags genre={genre} /> : null}
    </div>
  )
}
