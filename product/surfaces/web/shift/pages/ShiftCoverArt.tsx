/**
 * Shift library — a game cover image (atom).
 *
 * The bare cover `<img>` shared by every surface that shows box art (Reel
 * cover, Deck card, and — via its badge wrapper — the Library Tile). Alt is
 * empty by default because the cover is decorative beside its own title.
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export interface ShiftCoverArtProps {
  readonly src: string
  readonly alt?: string
  readonly loading?: "lazy" | "eager"
  readonly draggable?: boolean
}

export function ShiftCoverArt({
  src,
  alt = "",
  loading,
  draggable = false,
}: ShiftCoverArtProps) {
  return (
    <img
      src={src}
      alt={alt}
      draggable={draggable}
      {...(loading ? { loading } : {})}
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.coverArt)}
    />
  )
}
