import { Dices } from "lucide-react"
import {
  SHIFT_DESIGN_PARTS,
  shiftDesignPartAttrs,
} from "../../shift-design-parts"

/**
 * The rail's trailing "Surprise" affordance — the Library tile's twin: the same
 * ShiftCineTile frame + focus lift and the shared non-game "destination" skin
 * (`.shift-cine-tile-affordance`), with a dice motif and label instead of cover
 * art. Confirming it asks the home for a random pick. Purely presentational; the
 * owning screen wires `onFocus`/`onActivate`.
 */
export interface ShiftCineSurpriseTileProps {
  readonly index: number
  readonly focused?: boolean
  readonly onFocus: () => void
  readonly onActivate: () => void
}

export function ShiftCineSurpriseTile({
  index,
  focused,
  onFocus,
  onActivate,
}: ShiftCineSurpriseTileProps) {
  return (
    <button
      type="button"
      data-cine-index={index}
      data-focused={focused || undefined}
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.cineSurpriseTile)}
      className="shift-cine-tile shift-cine-tile-affordance"
      aria-label="Surprise me"
      onFocus={onFocus}
      onClick={onActivate}
    >
      <span className="shift-cine-tile-affordance-inner">
        <Dices className="shift-cine-tile-affordance-icon" aria-hidden />
        <span className="shift-cine-tile-affordance-label">Surprise</span>
      </span>
    </button>
  )
}
