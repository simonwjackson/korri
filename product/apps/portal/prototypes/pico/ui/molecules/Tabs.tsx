/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: molecule.
 *
 * Horizontal tab strip. Moved from `kit.tsx`.
 */
export function Tabs({
  items,
  activeIndex,
}: {
  readonly items: readonly string[]
  readonly activeIndex: number
}) {
  return (
    <div className="pc-tabs">
      {items.map((item, index) => (
        <span
          key={item}
          className={`pc-tab ${index === activeIndex ? "sel" : ""}`}
        >
          {item}
        </span>
      ))}
    </div>
  )
}
