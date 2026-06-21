/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: atom.
 *
 * Two-segment ON/OFF toggle. Moved from `kit.tsx`.
 */
export type ToggleState = "on" | "off"

export function Toggle({ state }: { readonly state: ToggleState }) {
  return (
    <span className="pc-toggle">
      <span className={state === "on" ? "on" : ""}>ON</span>
      <span className={state === "off" ? "on" : ""}>OFF</span>
    </span>
  )
}
