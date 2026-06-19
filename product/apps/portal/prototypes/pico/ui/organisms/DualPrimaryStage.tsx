/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * Dual-screen primary surface: a companion-connected tag, a cart rail, and the
 * focused game with launch-on-TV / launch-here actions.
 */
import type { PicoGame } from "../../fixtures"
import { Btn } from "../../screens/kit"
import { Icon } from "../atoms/Icon"
import { Title } from "../atoms/Title"
import { GameCart } from "../molecules/GameCart"

export function DualPrimaryStage({ hero }: { readonly hero: PicoGame }) {
  return (
    <>
      <div className="pcMd-companion-tag">
        <span className="pcMd-dot" />
        COMPANION CONNECTED · 65" 4K TV
      </div>
      <div className="pcMd-primary">
        <div className="pcMd-rail">
          <div className="pc-art sm">
            <GameCart game={hero} showFav={false} />
          </div>
          <div className="pc-art sm pcMd-rail-side">
            <GameCart game={hero} showFav={false} />
          </div>
          <div className="pc-art sm pcMd-rail-side">
            <GameCart game={hero} showFav={false} />
          </div>
        </div>
        <div className="pcMd-primary-info">
          <Title size={1}>{hero.title}</Title>
          <div className="pc-sub">{hero.developer}</div>
          <div className="pcMd-launch-row">
            <Btn kind="primary">
              <Icon name="play" /> LAUNCH ON TV
            </Btn>
            <Btn>HERE</Btn>
          </div>
        </div>
      </div>
    </>
  )
}
