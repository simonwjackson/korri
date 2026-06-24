import { Option } from "effect"
import { useShiftCatalogCase } from "../catalog/ShiftCatalogStateRoot"

export function ShiftHomeLoadErrorBody({
  onRetry,
}: {
  readonly onRetry: () => void
}) {
  const loadError = useShiftCatalogCase("LoadError")

  return Option.match(loadError, {
    onNone: () => null,
    onSome: () => (
      <main
        data-shift-home
        className="intrinsic relative flex h-full w-full flex-col items-center justify-center gap-[var(--shift-space-1)] text-[color:var(--shift-ink)]"
      >
        <p className="opacity-90">Could not load library.</p>
        <button
          type="button"
          onClick={onRetry}
          className="underline opacity-90"
        >
          Retry
        </button>
      </main>
    ),
  })
}
