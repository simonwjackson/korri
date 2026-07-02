/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * Controller remap list: action → bound button, with the row currently
 * listening for input spinning.
 */

import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Spinner } from "../atoms/Spinner"

type RemapRow =
  | {
      readonly _tag: "Bound"
      readonly action: string
      readonly button: string
    }
  | {
      readonly _tag: "Listening"
      readonly action: string
      readonly button: string
    }

const REMAP_ACTIONS: readonly RemapRow[] = [
  { _tag: "Bound", action: "UP", button: "D-PAD ↑" },
  { _tag: "Bound", action: "DOWN", button: "D-PAD ↓" },
  { _tag: "Bound", action: "A", button: "SOUTH ●" },
  { _tag: "Listening", action: "B", button: "EAST ●" },
  { _tag: "Bound", action: "X", button: "WEST ●" },
  { _tag: "Bound", action: "Y", button: "NORTH ●" },
  { _tag: "Bound", action: "L", button: "L1" },
  { _tag: "Bound", action: "R", button: "R1" },
  { _tag: "Bound", action: "START", button: "START +" },
  { _tag: "Bound", action: "SELECT", button: "SELECT −" },
]

export function RemapList() {
  return (
    <div
      className="pcIg-remap"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.remapList)}
    >
      {REMAP_ACTIONS.map(row => (
        <div
          key={row.action}
          className={`pcIg-remap-row ${row._tag === "Listening" ? "listen" : ""}`}
        >
          <span className="pcIg-remap-act">{row.action}</span>
          <span className="pcIg-remap-arrow">→</span>
          <span className="pcIg-remap-btn">
            {row._tag === "Listening" ? (
              <>
                press any button… <Spinner />
              </>
            ) : (
              row.button
            )}
          </span>
        </div>
      ))}
    </div>
  )
}
