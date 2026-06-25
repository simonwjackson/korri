import { App } from "./app"
import { GAMES } from "./steamgriddb"

export const StoreIdle = {
  name: "Boxbuster Store Idle",
  note: "Full store scene with TV off",
  presentation: "surface" as const,
  render: () => <App embedded games={GAMES.slice(0, 8)} playing={null} />,
}

export const StoreNowPlaying = {
  name: "Boxbuster Store Now Playing",
  note: "Full store scene with a game routed to the TV",
  presentation: "surface" as const,
  render: () => (
    <App embedded games={GAMES.slice(0, 8)} playing={GAMES[0] ?? null} />
  ),
}
