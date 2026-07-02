/**
 * pico surface. ATOMIC LAYER: molecule.
 *
 * Horizontal tab strip. Moved from `kit.tsx`.
 */
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"

export function Tabs({
  items,
  activeIndex,
}: {
  readonly items: readonly string[]
  readonly activeIndex: number
}) {
  return (
    <div className="pc-tabs" {...picoDesignPartAttrs(PICO_DESIGN_PARTS.tabs)}>
      {items.map((item, index) => (
        <span
          key={item}
          className={`pc-tab ${index === activeIndex ? "sel" : ""}`}
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcTab)}
        >
          {item}
        </span>
      ))}
    </div>
  )
}
