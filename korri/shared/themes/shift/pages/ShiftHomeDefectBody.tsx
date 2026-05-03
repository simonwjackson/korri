import { useLibraryListCase } from "@shared/library/library-list-state-root"
import { Option } from "effect"

export function ShiftHomeDefectBody() {
  const defect = useLibraryListCase("Defect")

  return Option.match(defect, {
    onNone: () => null,
    onSome: () => (
      <main
        data-shift-home
        className="relative flex h-screen w-full flex-col items-center justify-center gap-2 text-[color:var(--shift-ink)]"
      >
        <p className="opacity-90">Could not load library.</p>
        <p className="max-w-prose text-sm opacity-60">Unexpected defect.</p>
      </main>
    ),
  })
}
