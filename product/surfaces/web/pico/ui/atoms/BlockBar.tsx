/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: atom.
 *
 * Chunky block slider (▓░ run) like Variant B. Moved from `kit.tsx`.
 */
export function BlockBar({
  level,
  max,
}: {
  readonly level: number
  readonly max: number
}) {
  return (
    <span className="pc-bar">
      <span className="pc-bar-on">{"█".repeat(Math.max(0, level))}</span>
      <span className="pc-bar-off">{"░".repeat(Math.max(0, max - level))}</span>
    </span>
  )
}
