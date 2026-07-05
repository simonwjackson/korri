import type { CSSProperties } from "react"
import {
  SHIFT_DESIGN_PARTS,
  shiftDesignPartAttrs,
} from "../../shift-design-parts"
import { ShiftCoverArt } from "../atoms/ShiftCoverArt"

/** One game tile in the cinematic rail: a native focusable button wrapping the
 * cover art. Focus is driven by the platform focus engine (every input device),
 * so the tile only exposes `onFocus`/`onActivate` and a `focused` flag — no raw
 * key handling. `index` feeds the rail's centering math via `data-cine-index`. */
export interface ShiftCineTileProps {
  readonly index: number
  readonly title: string
  readonly artUrl: string
  readonly aspectRatio?: string
  readonly focused?: boolean
  readonly renderImage?: boolean
  /** Flags a discovery/recommended pick — draws a small "Fresh" corner marker. */
  readonly fresh?: boolean
  readonly onFocus: () => void
  readonly onActivate: () => void
}

export function ShiftCineTile({
  index,
  title,
  artUrl,
  aspectRatio,
  focused,
  renderImage = true,
  fresh,
  onFocus,
  onActivate,
}: ShiftCineTileProps) {
  return (
    <button
      type="button"
      data-cine-index={index}
      data-focused={focused || undefined}
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.tile, title)}
      className="shift-cine-tile"
      style={tileAspectStyle(aspectRatio)}
      aria-label={title}
      onFocus={onFocus}
      onClick={onActivate}
    >
      {renderImage ? <ShiftCoverArt src={artUrl} loading="eager" /> : null}
      {fresh ? <span className="shift-cine-tile-fresh">Fresh</span> : null}
    </button>
  )
}

function tileAspectStyle(
  aspectRatio: string | undefined,
): CSSProperties | undefined {
  if (!aspectRatio) return undefined
  return { "--shift-cine-tile-aspect": aspectRatio } as CSSProperties
}
