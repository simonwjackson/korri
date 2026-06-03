import { useLibraryListCase } from "@platform/react/library/library-list-state-root"
import { Option } from "effect"

export function ShiftHomeEmptyBody() {
  const ready = useLibraryListCase("Ready")

  return Option.match(ready, {
    onNone: () => null,
    onSome: ({ games }) =>
      games.length === 0 ? (
        <main
          data-shift-home
          className="relative flex h-screen w-full flex-col items-center justify-center text-[color:var(--shift-ink)]"
        >
          <p className="opacity-70">No games found.</p>
        </main>
      ) : null,
  })
}
