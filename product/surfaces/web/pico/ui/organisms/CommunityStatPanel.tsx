/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * Community readout for a game: a strip of stat tiles plus a difficulty meter.
 * Renders a fragment so both blocks sit directly in the detail screen flow. Leaf
 * atoms (Stat/Card/BlockBar) still come from the kit barrel until they migrate.
 */
import type { PicoCommunityStats } from "../../fixtures-extra"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { BlockBar } from "../atoms/BlockBar"
import { Stat } from "../atoms/Stat"
import { Card } from "../molecules/Card"

export function CommunityStatPanel({
  stats,
}: {
  readonly stats: PicoCommunityStats
}) {
  const liked = Math.round((stats.likes / (stats.likes + stats.dislikes)) * 100)
  return (
    <>
      <div
        className="pcDet-stats"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.communityStatPanel)}
      >
        <Stat label="PLAYS" value={stats.plays.toLocaleString()} />
        <Stat label="LIKES" value={stats.likes.toLocaleString()} />
        <Stat label="DISLIKES" value={stats.dislikes} />
        <Stat label="SCORE" value={stats.score} />
        <Stat label="LIKED" value={`${liked}%`} />
      </div>
      <Card title="DIFFICULTY" className="pcDet-diff">
        <div
          className="pcDet-diff-row"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcDetDiffRow)}
        >
          <BlockBar level={stats.difficulty} max={10} />
          <span
            className="pc-dim"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.dim)}
          >
            {stats.difficulty} / 10
          </span>
        </div>
      </Card>
    </>
  )
}
