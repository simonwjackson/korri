import { LayoutGrid, List, Star } from "lucide-react"
import type { ViewMode } from "../fixtures/nav"

export interface ViewModeToggleProps {
  value: ViewMode
  onChange: (mode: ViewMode) => void
}

const modes: ReadonlyArray<{
  value: ViewMode
  Icon: typeof LayoutGrid
  label: string
}> = [
  { value: "grid", Icon: LayoutGrid, label: "Grid" },
  { value: "list", Icon: List, label: "List" },
  { value: "featured", Icon: Star, label: "Featured" },
]

export function ViewModeToggle({ value, onChange }: ViewModeToggleProps) {
  return (
    <div className="flex rounded bg-neutral-200 p-0.5 dark:bg-neutral-800">
      {modes.map(({ value: mode, Icon, label }) => {
        const isActive = mode === value
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            aria-label={label}
            aria-pressed={isActive}
            className={`cursor-pointer rounded border-none p-1 ${
              isActive
                ? "bg-white text-inherit shadow-sm dark:bg-neutral-700"
                : "bg-transparent text-neutral-400"
            }`}
          >
            <Icon className="h-3 w-3" aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}
