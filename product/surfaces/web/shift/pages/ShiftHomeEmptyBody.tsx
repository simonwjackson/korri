import { Option } from "effect"
import { useShiftCatalogCase } from "../catalog/ShiftCatalogStateRoot"
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export function ShiftHomeEmptyBody() {
  const empty = useShiftCatalogCase("Empty")

  return Option.match(empty, {
    onNone: () => null,
    onSome: () => (
      <main
        data-shift-home
        className="intrinsic relative flex h-full w-full flex-col items-center justify-center text-[color:var(--shift-ink)]"
        {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.homeEmpty)}
      >
        <p className="opacity-70">No games found.</p>
      </main>
    ),
  })
}
