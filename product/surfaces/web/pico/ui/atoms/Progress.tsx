/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: atom.
 *
 * Determinate progress bar (0..100). Width is the only inline style (layout,
 * not type), which is allowed. Moved from `kit.tsx`.
 */
export function Progress({ pct }: { readonly pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct))
  return (
    <div className="pc-progress">
      <div className="pc-progress-fill" style={{ width: `${clamped}%` }} />
    </div>
  )
}
