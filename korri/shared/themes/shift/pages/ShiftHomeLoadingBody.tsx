import { useLibraryListCase } from "@shared/library/library-list-state-root"
import { Option } from "effect"

export function ShiftHomeLoadingBody() {
  const loading = useLibraryListCase("Loading")

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
