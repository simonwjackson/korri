import { Option } from "effect"
import { useShiftCatalogCase } from "../catalog/ShiftCatalogStateRoot"
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export function ShiftHomeDefectBody() {
  const defect = useShiftCatalogCase("Defect")

  return Option.match(defect, {
    onNone: () => null,
    onSome: () => (
      <main
        data-shift-home
        className="intrinsic relative flex h-full w-full flex-col items-center justify-center gap-[var(--shift-space-1)] text-[color:var(--shift-ink)]"
        {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.homeDefect)}
      >
        <p className="opacity-90">Could not load library.</p>
        <p className="max-w-[var(--shift-measure-prose)] text-[length:var(--shift-text-fine)] opacity-60">
          Unexpected defect.
        </p>
      </main>
    ),
  })
}
