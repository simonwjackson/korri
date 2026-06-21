import { Option } from "effect"
import { useShiftCatalogCase } from "../catalog/ShiftCatalogStateRoot"

export function ShiftHomeLoadingBody() {
  const loading = useShiftCatalogCase("Loading")

  return Option.match(loading, {
    onNone: () => null,
    onSome: () => (
      <main
        data-shift-home
        className="relative flex h-screen w-full flex-col items-center justify-center text-[color:var(--shift-ink)]"
      >
        <p className="opacity-70">Loading library…</p>
      </main>
    ),
  })
}
