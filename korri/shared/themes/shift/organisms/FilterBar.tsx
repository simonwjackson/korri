import { SearchInput } from "../atoms/SearchInput"
import { Select, type SelectOption } from "../atoms/Select"
import type { ViewMode } from "../fixtures/nav"
import { ViewModeToggle } from "../molecules/ViewModeToggle"

export interface FilterBarProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  platformOptions: ReadonlyArray<SelectOption>
  selectedPlatform: string
  onPlatformChange: (value: string) => void
  genreOptions: ReadonlyArray<SelectOption>
  selectedGenre: string
  onGenreChange: (value: string) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
}

export function FilterBar({
  searchQuery,
  onSearchChange,
  platformOptions,
  selectedPlatform,
  onPlatformChange,
  genreOptions,
  selectedGenre,
  onGenreChange,
  viewMode,
  onViewModeChange,
}: FilterBarProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1">
        <SearchInput
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search games…"
        />
      </div>
      <Select
        value={selectedPlatform}
        options={platformOptions}
        onChange={e => onPlatformChange(e.target.value)}
        ariaLabel="Platform"
      />
      <Select
        value={selectedGenre}
        options={genreOptions}
        onChange={e => onGenreChange(e.target.value)}
        ariaLabel="Genre"
      />
      <ViewModeToggle value={viewMode} onChange={onViewModeChange} />
    </div>
  )
}
