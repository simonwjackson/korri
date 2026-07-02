/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * Launch gate "spinning up" state: the cart, its title, and a stream-status
 * spinner.
 */
import type { PicoGame } from "../../fixtures"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Spinner } from "../atoms/Spinner"
import { Title } from "../atoms/Title"
import { GameCartUnmarked } from "../molecules/GameCartUnmarked"

export function LaunchingStage({ game }: { readonly game: PicoGame }) {
  return (
    <div
      className="pcSes-launch"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.launchingStage)}
    >
      <div className="pc-art" {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcArt)}>
        <GameCartUnmarked game={game} />
      </div>
      <Title size={1}>{game.title}</Title>
      <div
        className="pcSes-launch-status"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSesLaunchStatus)}
      >
        <Spinner />
        <span
          className="pc-sub"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.sub)}
        >
          SPINNING UP THE STREAM…
        </span>
      </div>
    </div>
  )
}
