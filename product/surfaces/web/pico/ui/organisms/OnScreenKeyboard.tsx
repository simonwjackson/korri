/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * The on-screen 8-bit keyboard: rows of single-character keys you drive with the
 * d-pad. Layout is intrinsic to the keyboard so it lives here.
 */
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"

const KEY_ROWS: readonly string[] = [
  "ABCDEFGHIJ",
  "KLMNOPQRST",
  "UVWXYZ0123",
  "456789",
]

export function OnScreenKeyboard() {
  return (
    <div
      className="pcLib-keyboard"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.onScreenKeyboard)}
    >
      {KEY_ROWS.map(row => (
        <div key={row} className="pcLib-keyrow">
          {[...row].map(char => (
            <span key={char} className="pcLib-key">
              {char}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}
