/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: atom.
 *
 * Two-segment ON/OFF toggle. Moved from `kit.tsx`.
 */
export function Toggle({ on }: { readonly on: boolean }) {
  return (
    <span className="pc-toggle">
      <span className={on ? "on" : ""}>ON</span>
      <span className={on ? "" : "on"}>OFF</span>
    </span>
  )
}
