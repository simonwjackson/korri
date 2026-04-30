import type { ViewMode } from "../fixtures/nav"
import { FilterChipBar } from "../molecules/FilterChipBar"
import { ViewModeToggle } from "../molecules/ViewModeToggle"

export interface GameFilterBarProps {
  filters: ReadonlyArray<string>
  activeFilter: string
  onFilterChange: (filter: string) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  gameCount: number
}

export function GameFilterBar({
  filters,
  activeFilter,
  onFilterChange,
  viewMode,
  onViewModeChange,
  gameCount,
}: GameFilterBarProps) {
  return (
    <div className="flex flex-col gap-4">
      <FilterChipBar
        filters={filters}
        activeFilter={activeFilter}
        onFilterChange={onFilterChange}
      />
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
          {activeFilter}
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500">{gameCount} games</span>
          <ViewModeToggle value={viewMode} onChange={onViewModeChange} />
        </div>
      </div>
    </div>
  )
}
