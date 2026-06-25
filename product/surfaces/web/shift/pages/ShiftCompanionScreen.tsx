import { asPlayableLibraryEntry } from "@platform/library/playable-library"
import {
  getPlayableDisplayName,
  getPlayableImageUrl,
} from "@platform/library/playable-library-ui"
import { useDualScreenSession } from "@platform/react/display/dual-screen/DualScreenSession.context"
import type { ShiftHomeInputItem } from "../templates/ShiftHome.context"

export interface ShiftCompanionScreenProps {
  readonly items: ReadonlyArray<ShiftHomeInputItem>
}

export function ShiftCompanionScreen({ items }: ShiftCompanionScreenProps) {
  const { selectedGameId } = useDualScreenSession()
  const selectedGameInput =
    items.find(game => game.id === selectedGameId) ?? items[0]
  if (!selectedGameInput) return null
  const selectedGame = asPlayableLibraryEntry(selectedGameInput)
  const studio =
    "releases" in selectedGameInput
      ? (selectedGame.releases[0]?.system ?? "Unknown system")
      : (selectedGameInput.metadata?.developer ?? "Unknown studio")

  const imageUrl = getPlayableImageUrl(selectedGame)
  const title = getPlayableDisplayName(selectedGame)

  return (
    <div data-shift-home className="intrinsic relative h-full overflow-hidden">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="absolute inset-0 h-full w-full scale-105 object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-[color:var(--shift-surface-sunk)]" />
      )}
      <div className="absolute inset-0 bg-linear-to-t from-[color:var(--shift-scrim-strong)] via-[color:var(--shift-scrim-mid)] to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-[var(--shift-space-5)] text-[color:var(--shift-on-media-ink)]">
        <h2 className="max-w-[var(--shift-measure-display)] text-[length:var(--shift-text-hero)] font-black leading-[0.95] tracking-tight">
          {title}
        </h2>
        <p className="mt-[var(--shift-space-2)] text-[length:var(--shift-text-heading)] font-bold text-[color:var(--shift-on-media-ink-dim)]">
          {studio}
        </p>
      </div>
    </div>
  )
}
