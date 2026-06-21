/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * Launch gate "spinning up" state: the cart, its title, and a stream-status
 * spinner.
 */
import type { PicoGame } from "../../fixtures"
import { Spinner } from "../atoms/Spinner"
import { Title } from "../atoms/Title"
import { GameCartUnmarked } from "../molecules/GameCartUnmarked"

export function LaunchingStage({ game }: { readonly game: PicoGame }) {
  return (
    <div className="pcSes-launch">
      <div className="pc-art">
        <GameCartUnmarked game={game} />
      </div>
      <Title size={1}>{game.title}</Title>
      <div className="pcSes-launch-status">
        <Spinner />
        <span className="pc-sub">SPINNING UP THE STREAM…</span>
      </div>
    </div>
  )
}
