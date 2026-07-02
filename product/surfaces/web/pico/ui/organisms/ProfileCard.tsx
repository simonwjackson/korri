/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * Player profile: avatar + level/XP, lifetime stats, and favorite-genre chips.
 */
import type { PicoGame } from "../../fixtures"
import type { PicoFriend } from "../../fixtures-extra"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Chip } from "../atoms/Chip"
import { Progress } from "../atoms/Progress"
import { Stat } from "../atoms/Stat"
import { Title } from "../atoms/Title"
import { Card } from "../molecules/Card"

export function ProfileCard({
  games,
  friends,
}: {
  readonly games: readonly PicoGame[]
  readonly friends: readonly PicoFriend[]
}) {
  return (
    <>
      <div
        className="pcFut-prof-head"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.profileCard)}
      >
        <span className="pcFut-prof-ava">PJ</span>
        <div className="pcFut-prof-id">
          <Title size={1}>PIXELJ</Title>
          <div className="pc-sub">LEVEL 24 · ROVING ROMHACKER</div>
          <div className="pcFut-prof-xp">
            <Progress pct={68} />
            <span className="pc-dim">6,820 / 10,000 XP</span>
          </div>
        </div>
      </div>
      <div className="pcFut-prof-stats">
        <Stat label="GAMES" value={games.length} />
        <Stat label="PLAYTIME" value="312h" />
        <Stat label="TROPHIES" value="3 / 5" />
        <Stat label="FRIENDS" value={friends.length} />
      </div>
      <Card title="FAVORITE GENRES">
        <div className="pcFut-prof-chips">
          <Chip>PLATFORMER</Chip>
          <Chip>METROIDVANIA</Chip>
          <Chip>SHMUP</Chip>
          <Chip>ROGUELITE</Chip>
        </div>
      </Card>
    </>
  )
}
