import { useDualScreenSession } from "@shared/display/dual-screen/DualScreenSession.context"
import {
  type GameRecord,
  getGameDisplayName,
  getGameImageUrl,
} from "@shared/fixtures/games/game"

export interface ShiftCompanionScreenProps {
  readonly items: ReadonlyArray<GameRecord>
}

export function ShiftCompanionScreen({ items }: ShiftCompanionScreenProps) {
  const { selectedGameId } = useDualScreenSession()
  const selectedGame = items.find(game => game.id === selectedGameId) ??
    items[0] ?? {
      id: selectedGameId,
    }
  const imageUrl = getGameImageUrl(selectedGame)
  const title = getGameDisplayName(selectedGame)

  return (
    <div data-shift-home className="relative h-full overflow-hidden">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="absolute inset-0 h-full w-full scale-105 object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-[color:var(--shift-surface-sunk)]" />
      )}
      <div className="absolute inset-0 bg-linear-to-t from-black/82 via-black/24 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-10 text-white">
        <h2 className="max-w-[14ch] text-6xl font-black leading-[0.95] tracking-tight">
          {title}
        </h2>
        <p className="mt-4 text-2xl font-bold text-white/72">
          {selectedGame.metadata?.developer ?? "Unknown studio"}
        </p>
      </div>
    </div>
  )
}
