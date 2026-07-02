/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * The art-forward "Players & Devices" hub: an active-session card, a
 * seats + friends two-column block, and a start-new-session action.
 */
import type { PicoGame } from "../../fixtures"
import type { PicoFriend, PicoPlayer } from "../../fixtures-extra"
import { PicoArtImage } from "../../PicoArtImage"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Btn } from "../atoms/Btn"
import { Dim } from "../atoms/Dim"
import { Icon } from "../atoms/Icon"
import { Title } from "../atoms/Title"
import { Card } from "../molecules/Card"
import { Player } from "../molecules/Player"

export function PlayersHub({
  game,
  players,
  friends,
}: {
  readonly game: PicoGame | undefined
  readonly players: readonly PicoPlayer[]
  readonly friends: readonly PicoFriend[]
}) {
  const active = players.filter(player => player.status !== "open")
  return (
    <div
      className="pcMp-hub"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.playersHub)}
    >
      <Card className="pcMp-hub-session">
        {game?.art ? (
          <PicoArtImage src={game.art} className="pcMp-hub-art" />
        ) : null}
        <div className="pcMp-hub-session-info">
          <Dim>ACTIVE SESSION</Dim>
          <Title size={1}>{game?.title ?? "—"}</Title>
          <div className="pcMp-row">
            {active.map(player => (
              <Player key={player.id} player={player} rep="avatar" />
            ))}
          </div>
          <Btn kind="primary">
            <Icon name="play" /> RESUME · {active.length}P
          </Btn>
        </div>
      </Card>

      <div className="pcMp-hub-cols">
        <Card title="THIS DEVICE & SEATS" className="pcMp-hub-card">
          {players.map(player => (
            <div key={player.id} className="pcMp-hub-seat">
              <Player player={player} rep="pad" />
              <Dim>{player.controller}</Dim>
            </div>
          ))}
        </Card>
        <Card title="FRIENDS ONLINE" className="pcMp-hub-card">
          {friends.slice(0, 4).map(friend => (
            <div key={friend.id} className="pcMp-friend">
              <span className={`pcMp-pres ${friend.status}`} />
              <span className="pcMp-friend-name">{friend.name}</span>
              <Dim>{friend.playing ?? friend.status}</Dim>
            </div>
          ))}
        </Card>
      </div>

      <Btn kind="primary">
        <Icon name="plus" /> START A NEW SESSION
      </Btn>
    </div>
  )
}
