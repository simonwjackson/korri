import { Filter, Search } from "lucide-react"

export interface FilterChipBarProps {
  filters: ReadonlyArray<string>
  activeFilter: string
  onFilterChange: (filter: string) => void
  onSearchClick?: () => void
  onAdvancedClick?: () => void
}

export function FilterChipBar({
  filters,
  activeFilter,
  onFilterChange,
  onSearchClick,
  onAdvancedClick,
}: FilterChipBarProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onSearchClick}
        aria-label="Search"
        className="flex cursor-pointer items-center justify-center rounded-lg border-none bg-neutral-300 p-1.5 transition-colors duration-200 hover:bg-neutral-400 dark:bg-neutral-700 dark:hover:bg-neutral-600"
      >
        <Search className="h-4 w-4" aria-hidden="true" />
      </button>
      <div className="shift-scrollbar-hide flex flex-1 gap-1.5 overflow-x-auto">
        {filters.map(filter => {
          const isActive = filter === activeFilter
          return (
            <button
              key={filter}
              type="button"
              onClick={() => onFilterChange(filter)}
              aria-pressed={isActive}
              className={`flex-shrink-0 cursor-pointer whitespace-nowrap rounded-lg border-none px-2.5 py-1.5 text-xs transition-colors duration-200 ${
                isActive
                  ? "bg-red-600 font-medium text-white shadow-sm dark:bg-red-500"
                  : "bg-neutral-300 text-neutral-700 hover:bg-neutral-400 dark:bg-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-600"
              }`}
            >
              {filter}
            </button>
          )
        })}
      </div>
      <button
        type="button"
        onClick={onAdvancedClick}
        aria-label="Advanced filters"
        className="flex cursor-pointer items-center justify-center rounded-lg border-none bg-neutral-300 p-1.5 transition-colors duration-200 hover:bg-neutral-400 dark:bg-neutral-700 dark:hover:bg-neutral-600"
      >
        <Filter className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}
