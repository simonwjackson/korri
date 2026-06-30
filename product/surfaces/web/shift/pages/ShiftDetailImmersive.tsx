/**
 * Shift game detail — Rebalance A: Immersive.
 *
 * Keeps the Deck's "art is the environment" identity: a full-bleed blurred wash
 * of the cover fills the frame and all weight sits bottom-left — eyebrow, big
 * title, a line of synopsis, glanceable stats, then the actions. The controller
 * legend rides top-right as a HUD so it never competes with the content. No
 * riffle arrows, no counter — this is one game, not a browse.
 */
import { useInputAction } from "@platform/react/input/use-input-action"
import type { CSSProperties } from "react"
import { ShiftDetailActions } from "./ShiftDetailActions"
import { ShiftDetailHints } from "./ShiftDetailHints"
import type { ShiftGameDetailView } from "./ShiftGameDetailScreen"
import { shiftDetailSynopsis } from "./shift-detail-copy"

export interface ShiftDetailImmersiveProps {
  readonly game: ShiftGameDetailView
  readonly onPlay?: (id: string) => void
  readonly onFavorite?: (id: string) => void
  readonly onBack?: () => void
}

export function ShiftDetailImmersive({
  game,
  onPlay,
  onFavorite,
  onBack,
}: ShiftDetailImmersiveProps) {
  useInputAction("back", () => onBack?.())

  const tags = [game.genre, game.developer].filter(Boolean).join(" · ")
  const bleed = { backgroundImage: `url(${game.artUrl})` } as CSSProperties

  return (
    <div data-shift-detail className="shift-detail-immersive intrinsic">
      <div className="shift-detail-imm-bleed" style={bleed} />
      <div className="shift-detail-imm-scrim" />

      <div className="shift-detail-imm-hud">
        <ShiftDetailHints game={game} />
      </div>

      <div className="shift-detail-imm-content">
        {tags ? <span className="shift-detail-tags">{tags}</span> : null}
        <h1 className="shift-detail-title">{game.title}</h1>
        <p className="shift-detail-synopsis">{shiftDetailSynopsis(game)}</p>
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
    </div>
  )
}
