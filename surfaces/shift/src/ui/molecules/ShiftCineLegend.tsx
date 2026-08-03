import {
  SHIFT_DESIGN_PARTS,
  shiftDesignPartAttrs,
} from "../../shift-design-parts"
import { ShiftCineHint } from "../atoms/ShiftCineHint"

/** The bottom-right row of button hints, mapping physical buttons to actions.
 * The owning screen decides the hint set (it changes with launch state), so the
 * molecule just lays out the `ShiftCineHint` atoms it's given. */
export interface ShiftCineHintSpec {
  readonly glyph: string
  readonly label: string
  readonly primary?: boolean
}

export function ShiftCineLegend({
  hints,
}: {
  readonly hints: readonly ShiftCineHintSpec[]
}) {
  return (
    <div
      className="shift-cine-legend"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.legend)}
    >
      {hints.map(hint => (
        <ShiftCineHint
          key={`${hint.glyph}:${hint.label}`}
          glyph={hint.glyph}
          label={hint.label}
          primary={hint.primary}
        />
      ))}
    </div>
  )
}
