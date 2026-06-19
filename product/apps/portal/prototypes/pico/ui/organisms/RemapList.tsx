/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * Controller remap list: action → bound button, with the row currently
 * listening for input spinning.
 */
import { Spinner } from "../../screens/kit"

const REMAP_ACTIONS: readonly {
  readonly action: string
  readonly button: string
  readonly listening?: boolean
}[] = [
  { action: "UP", button: "D-PAD ↑" },
  { action: "DOWN", button: "D-PAD ↓" },
  { action: "A", button: "SOUTH ●" },
  { action: "B", button: "EAST ●", listening: true },
  { action: "X", button: "WEST ●" },
  { action: "Y", button: "NORTH ●" },
  { action: "L", button: "L1" },
  { action: "R", button: "R1" },
  { action: "START", button: "START +" },
  { action: "SELECT", button: "SELECT −" },
]

export function RemapList() {
  return (
    <div className="pcIg-remap">
      {REMAP_ACTIONS.map(row => (
        <div
          key={row.action}
          className={`pcIg-remap-row ${row.listening ? "listen" : ""}`}
        >
          <span className="pcIg-remap-act">{row.action}</span>
          <span className="pcIg-remap-arrow">→</span>
          <span className="pcIg-remap-btn">
            {row.listening ? (
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
