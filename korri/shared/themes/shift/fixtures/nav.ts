export const navigationTabs: ReadonlyArray<string> = [
  "Library",
  "Featured",
  "Recently Played",
  "Favorites",
  "Settings",
]

export const filterChips: ReadonlyArray<string> = [
  "All",
  "Action",
  "Puzzle",
  "RPG",
  "Strategy",
  "Cozy",
  "Driving",
  "Sci-Fi",
  "Survival",
  "Sports",
]

export const sortOptions: ReadonlyArray<{ label: string; value: string }> = [
  { label: "Recently Played", value: "lastPlayed" },
  { label: "Name", value: "name" },
  { label: "Playtime", value: "playtime" },
  { label: "Release Date", value: "releaseDate" },
]

export const genreOptions: ReadonlyArray<{ label: string; value: string }> = [
  { label: "All Genres", value: "all" },
  { label: "Action", value: "action" },
  { label: "Puzzle", value: "puzzle" },
  { label: "RPG", value: "rpg" },
  { label: "Strategy", value: "strategy" },
]

export type ViewMode = "grid" | "list" | "featured"
