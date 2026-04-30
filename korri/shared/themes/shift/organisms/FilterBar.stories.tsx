import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { genreOptions, type ViewMode } from "../fixtures/nav"
import { FilterBar } from "./FilterBar"

const platformOptions = [
  { label: "All Platforms", value: "all" },
  { label: "PC", value: "pc" },
  { label: "Console", value: "console" },
  { label: "Handheld", value: "handheld" },
]

const meta = {
  title: "Themes/Shift/Organisms/FilterBar",
  component: FilterBar,
  parameters: { layout: "padded" },
  args: {
    searchQuery: "",
    onSearchChange: () => {},
    platformOptions,
    selectedPlatform: "all",
    onPlatformChange: () => {},
    genreOptions,
    selectedGenre: "all",
    onGenreChange: () => {},
    viewMode: "grid",
    onViewModeChange: () => {},
  },
  decorators: [
    Story => (
      <div className="w-[900px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FilterBar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

function Interactive() {
  const [search, setSearch] = useState("")
  const [platform, setPlatform] = useState("all")
  const [genre, setGenre] = useState("all")
  const [view, setView] = useState<ViewMode>("grid")
  return (
    <FilterBar
      searchQuery={search}
      onSearchChange={setSearch}
      platformOptions={platformOptions}
      selectedPlatform={platform}
      onPlatformChange={setPlatform}
      genreOptions={genreOptions}
      selectedGenre={genre}
      onGenreChange={setGenre}
      viewMode={view}
      onViewModeChange={setView}
    />
  )
}

export const Clickable: Story = { render: () => <Interactive /> }
