/**
 * Shift library — a game cover image (atom).
 *
 * The bare cover `<img>` shared by every surface that shows box art (Reel
 * cover, Deck card, and — via its badge wrapper — the Library Tile). Alt is
 * empty by default because the cover is decorative beside its own title.
 *
 * When `src` is empty the art is genuinely absent, not loading — so the atom
 * self-selects a title-derived monogram in the same slot instead of rendering a
 * broken image. Every surface that shows box art inherits the fallback for free.
 */
import {
  SHIFT_DESIGN_PARTS,
  shiftDesignPartAttrs,
} from "../../shift-design-parts"
import { ShiftMonogram } from "./ShiftMonogram"

export interface ShiftCoverArtProps {
  readonly src: string
  readonly alt?: string
  readonly loading?: "lazy" | "eager"
  /** Only emitted when provided, so callers that relied on the default keep it. */
  readonly draggable?: boolean
  /** Game title. Used to draw the monogram fallback when `src` is empty. */
  readonly title?: string
}

export function ShiftCoverArt({
  src,
  alt = "",
  loading,
  draggable,
  title,
}: ShiftCoverArtProps) {
  if (src === "") {
    return <ShiftMonogram title={title ?? alt} />
  }
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
