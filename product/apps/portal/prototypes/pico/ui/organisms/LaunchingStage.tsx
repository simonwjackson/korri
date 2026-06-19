/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * Launch gate "spinning up" state: the cart, its title, and a stream-status
 * spinner.
 */
import type { PicoGame } from "../../fixtures"
import { Spinner } from "../../screens/kit"
import { Title } from "../atoms/Title"
import { GameCart } from "../molecules/GameCart"

export function LaunchingStage({ game }: { readonly game: PicoGame }) {
  return (
    <div className="pcSes-launch">
      <div className="pc-art">
        <GameCart game={game} showFav={false} />
      </div>
      <Title size={1}>{game.title}</Title>
      <div className="pcSes-launch-status">
        <Spinner />
        <span className="pc-sub">SPINNING UP THE STREAM…</span>
      </div>
    </div>
  )
}
