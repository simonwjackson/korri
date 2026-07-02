/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * The "jump back in" cinematic hero: full-bleed key-art backdrop + an info
 * column (kicker / logo / last-played meta / continue CTA). Renders a fragment so
 * the backdrop stays a direct child of the `.pcLast` stage (absolute position).
 * Reuses the same backdrop / logo / CTA molecules as the Spotlight hero.
 */
import type { PicoGame } from "../../fixtures"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { GameLogo } from "../molecules/GameLogo"
import { KeyArtBackdrop } from "../molecules/KeyArtBackdrop"
import { PlayCta } from "../molecules/PlayCta"

export function LastPlayedHero({
  game,
  backdrop,
  meta,
}: {
  readonly game: PicoGame
  readonly backdrop: string | null | undefined
  readonly meta: string
}) {
  return (
    <>
      <KeyArtBackdrop
        src={backdrop}
        scale={2.8}
        className="pcLast-bg"
        partAttrs={picoDesignPartAttrs(PICO_DESIGN_PARTS.lastPlayedHero)}
      />
      <div className="pcLast-inner">
        <div className="pcLast-kicker">▸ JUMP BACK IN</div>
        <GameLogo
          logoUrl={game.logoUrl}
          title={game.title}
          scale={3}
          logoClassName="pcLast-logo"
          titleClassName="pcLast-title"
          titleSize={3}
        />
        {meta ? <div className="pcLast-meta">LAST PLAYED {meta}</div> : null}
        <PlayCta label="CONTINUE" className="pcLast-cta" />
      </div>
    </>
  )
}
