/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * The launch ritual: a cartridge dropping into a tube + a CRT power-on strip
 * naming the game. Presentation for the launch screen.
 */
import type { PicoGame } from "../../fixtures"
import { GameCartUnmarked } from "../molecules/GameCartUnmarked"

export function LaunchTube({ game }: { readonly game: PicoGame | undefined }) {
  return (
    <div className="pcPer-ritual">
      <div className="pcPer-tube">
        <div className="pcPer-slot" />
        {game ? (
          <div className="pcPer-cart">
            <GameCartUnmarked game={game} />
          </div>
        ) : null}
        <div className="pcPer-power">
          <div className="pcPer-power-line" />
          <div className="pcPer-power-game">
            <div className="pcPer-power-title">NOW PLAYING</div>
            <div className="pcPer-power-name">{game?.title ?? "GAME"}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
