/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: atom.
 *
 * Animated 8-bit spinner (three blinking blocks). Moved from `kit.tsx`.
 */
export function Spinner() {
  return (
    <span className="pc-spinner" aria-hidden="true">
      <b />
      <b />
      <b />
    </span>
  )
}
