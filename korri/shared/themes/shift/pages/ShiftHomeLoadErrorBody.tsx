import { useLibraryListCase } from "@shared/library/library-list-state-root"
import { Option } from "effect"

export function ShiftHomeLoadErrorBody({
  onRetry,
}: {
  readonly onRetry: () => void
}) {
  const loadError = useLibraryListCase("LoadError")

  return Option.match(loadError, {
    onNone: () => null,
    onSome: () => (
      <main
        data-shift-home
        className="relative flex h-screen w-full flex-col items-center justify-center gap-2 text-[color:var(--shift-ink)]"
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
