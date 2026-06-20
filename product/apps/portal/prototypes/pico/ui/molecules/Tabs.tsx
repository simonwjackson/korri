/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: molecule.
 *
 * Horizontal tab strip. Moved from `kit.tsx`.
 */
export function Tabs({
  items,
  sel,
}: {
  readonly items: readonly string[]
  readonly sel: number
}) {
  return (
    <div className="pc-tabs">
      {items.map((item, index) => (
        <span key={item} className={`pc-tab ${index === sel ? "sel" : ""}`}>
          {item}
        </span>
      ))}
    </div>
  )
}
