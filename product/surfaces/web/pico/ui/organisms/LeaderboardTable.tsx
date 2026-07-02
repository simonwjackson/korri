/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * Leaderboard: a friends/global tab header and ranked rows (medals for top 3,
 * the "you" row highlighted).
 */
import type { PicoScoreRow } from "../../fixtures-extra"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Title } from "../atoms/Title"
import { Tabs } from "../molecules/Tabs"

const MEDALS = ["①", "②", "③"]

export function LeaderboardTable({
  scores,
}: {
  readonly scores: readonly PicoScoreRow[]
}) {
  return (
    <>
      <div
        className="pcFut-lb-head"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.leaderboardTable)}
      >
        <Title size={0}>CELESTE · TIME ATTACK</Title>
        <Tabs items={["FRIENDS", "GLOBAL"]} activeIndex={0} />
      </div>
      <div
        className="pcFut-lb"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutLb)}
      >
        <div
          className="pcFut-lb-row head"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutLbRow)}
        >
          <span
            className="pcFut-lb-rank"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutLbRank)}
          >
            #
          </span>
          <span
            className="pcFut-lb-name"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutLbName)}
          >
            PLAYER
          </span>
          <span
            className="pcFut-lb-score"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutLbScore)}
          >
            SCORE
          </span>
        </div>
        {scores.map(row => (
          <div
            key={`${row.rank}-${row.name}`}
            className={`pcFut-lb-row ${row.you ? "you" : ""}`}
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutLbRow)}
          >
            <span
              className="pcFut-lb-rank"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutLbRank)}
            >
              {row.rank <= 3 ? MEDALS[row.rank - 1] : row.rank}
            </span>
            <span
              className="pcFut-lb-name"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutLbName)}
            >
              {row.name}
            </span>
            <span
              className="pcFut-lb-score"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutLbScore)}
            >
              {row.score}
            </span>
          </div>
        ))}
      </div>
    </>
  )
}
