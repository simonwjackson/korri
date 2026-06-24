import { Option } from "effect"
import { useShiftCatalogCase } from "../catalog/ShiftCatalogStateRoot"

export function ShiftHomeEmptyBody() {
  const empty = useShiftCatalogCase("Empty")

  return Option.match(empty, {
    onNone: () => null,
    onSome: () => (
      <main
        data-shift-home
        className="intrinsic relative flex h-full w-full flex-col items-center justify-center text-[color:var(--shift-ink)]"
      >
        <p className="opacity-70">No games found.</p>
      </main>
    ),
  })
}
