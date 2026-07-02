/**
 * Shift library — a game cover image (atom).
 *
 * The bare cover `<img>` shared by every surface that shows box art (Reel
 * cover, Deck card, and — via its badge wrapper — the Library Tile). Alt is
 * empty by default because the cover is decorative beside its own title.
 */
import {
  SHIFT_DESIGN_PARTS,
  shiftDesignPartAttrs,
} from "../../shift-design-parts"

export interface ShiftCoverArtProps {
  readonly src: string
  readonly alt?: string
  readonly loading?: "lazy" | "eager"
  /** Only emitted when provided, so callers that relied on the default keep it. */
  readonly draggable?: boolean
}

export function ShiftCoverArt({
  src,
  alt = "",
  loading,
  draggable,
}: ShiftCoverArtProps) {
  return (
    <img
      src={src}
      alt={alt}
      {...(loading ? { loading } : {})}
      {...(draggable === undefined ? {} : { draggable })}
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.coverArt)}
    />
  )
}
