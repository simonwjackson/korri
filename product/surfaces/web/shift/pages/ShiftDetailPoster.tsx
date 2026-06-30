/**
 * Shift game detail — Rebalance C: Poster.
 *
 * Symmetric and object-forward: the crisp portrait cover is the hero, centred
 * over a blurred bleed of itself, with the title, tags, stats and actions
 * stacked and centred beneath it like a film poster. The most reverent of the
 * three — one game, presented. The legend sits in the bottom bar.
 */
import { useInputAction } from "@platform/react/input/use-input-action"
import type { CSSProperties } from "react"
import { ShiftDetailActions } from "./ShiftDetailActions"
import { ShiftDetailHints } from "./ShiftDetailHints"
import type { ShiftGameDetailView } from "./ShiftGameDetailScreen"

export interface ShiftDetailPosterProps {
  readonly game: ShiftGameDetailView
  readonly onPlay?: (id: string) => void
  readonly onFavorite?: (id: string) => void
  readonly onBack?: () => void
}

export function ShiftDetailPoster({
  game,
  onPlay,
  onFavorite,
  onBack,
}: ShiftDetailPosterProps) {
  useInputAction("back", () => onBack?.())

  const tags = [game.genre, game.developer].filter(Boolean).join(" · ")
  const bleed = { backgroundImage: `url(${game.artUrl})` } as CSSProperties

  return (
    <div data-shift-detail className="shift-detail-poster intrinsic">
      <div className="shift-detail-poster-bleed" style={bleed} />
      <div className="shift-detail-poster-scrim" />

      <div className="shift-detail-poster-stack">
        <div className="shift-detail-art shift-detail-poster-art">
          <img src={game.artUrl} alt="" loading="lazy" />
        </div>
        <h1 className="shift-detail-title">{game.title}</h1>
        {tags ? <div className="shift-detail-tags">{tags}</div> : null}
        <div className="shift-detail-stats">
          <span>
            {game.lastPlayedLabel
              ? `Last played ${game.lastPlayedLabel}`
              : "Never played"}
          </span>
          {game.playtimeLabel ? <span>{game.playtimeLabel} played</span> : null}
        </div>
        <ShiftDetailActions
          game={game}
          onPlay={onPlay}
          onFavorite={onFavorite}
        />
      </div>

      <ShiftDetailHints game={game} />
    </div>
  )
}
