/**
 * Shift game detail — Rebalance B: Split.
 *
 * Balanced weight: the key art holds one full-height panel edge-to-edge, the
 * info column holds the other — title, tags, synopsis, stats, actions stacked
 * and left-aligned, editorial. A container aspect-ratio query stacks art-over-
 * info on a tall handheld and splits art | info on a wide lean-back frame, so
 * the balance follows the device shape, not a viewport breakpoint.
 */
import { useInputAction } from "@platform/react/input/use-input-action"
import { ShiftDetailActions } from "./ShiftDetailActions"
import { ShiftDetailArt } from "./ShiftDetailArt"
import { ShiftDetailHints } from "./ShiftDetailHints"
import { ShiftDetailStats } from "./ShiftDetailStats"
import { shiftDetailSynopsis } from "./shift-detail-copy"
import type { ShiftGameDetailView } from "./shift-game-detail-view"

export interface ShiftDetailSplitProps {
  readonly game: ShiftGameDetailView
  readonly onPlay?: (id: string) => void
  readonly onFavorite?: (id: string) => void
  readonly onBack?: () => void
}

export function ShiftDetailSplit({
  game,
  onPlay,
  onFavorite,
  onBack,
}: ShiftDetailSplitProps) {
  useInputAction("back", () => onBack?.())

  const tags = [game.genre, game.developer].filter(Boolean).join(" · ")

  return (
    <div data-shift-detail className="shift-detail-split intrinsic">
      <ShiftDetailArt artUrl={game.artUrl} />

      <div className="shift-detail-split-info">
        <h1 className="shift-detail-title">{game.title}</h1>
        {tags ? <div className="shift-detail-tags">{tags}</div> : null}
        <p className="shift-detail-synopsis">{shiftDetailSynopsis(game)}</p>
        <ShiftDetailStats
          lastPlayedLabel={game.lastPlayedLabel}
          playtimeLabel={game.playtimeLabel}
          favorite={game.favorite}
        />
        <ShiftDetailActions
          game={game}
          onPlay={onPlay}
          onFavorite={onFavorite}
        />
        <ShiftDetailHints game={game} />
      </div>
    </div>
  )
}
