/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: atom.
 *
 * Two-segment ON/OFF toggle. Moved from `kit.tsx`.
 */
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"

export type ToggleState = "on" | "off"

export function Toggle({ state }: { readonly state: ToggleState }) {
  return (
    <span
      className="pc-toggle"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.toggle)}
    >
      <span className={state === "on" ? "on" : ""}>ON</span>
      <span className={state === "off" ? "on" : ""}>OFF</span>
    </span>
  )
}
