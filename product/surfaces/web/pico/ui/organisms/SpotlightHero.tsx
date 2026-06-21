/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * The Spotlight home's featured-game hero: key-art backdrop + cartridge + an
 * info column (kicker / logo / tags / play CTA). Renders a fragment — the
 * backdrop and the hero block must stay direct children of the `.pcShow-spot`
 * stage so their absolute positioning resolves against it.
 */
import type { PicoGame } from "../../fixtures"
import { GameCartUnmarked } from "../molecules/GameCartUnmarked"
import { GameLogo } from "../molecules/GameLogo"
import { KeyArtBackdrop } from "../molecules/KeyArtBackdrop"
import { PlayCta } from "../molecules/PlayCta"

export function SpotlightHero({
  hero,
  playState,
}: {
  readonly hero: PicoGame
  readonly playState: "start" | "continue"
}) {
  return (
    <>
      <KeyArtBackdrop
        src={hero.heroUrl}
        imageKey={`bg-${hero.id}`}
        className="pcShow-spot-herobg"
      />
      <div className="pcShow-spot-bg" />
      {/* key remounts the hero each rotation so the pop-in re-fires */}
      <div className="pcShow-spot-hero" key={hero.id}>
        <div className="pcShow-spot-art">
          <GameCartUnmarked game={hero} />
        </div>
        <div className="pcShow-spot-info">
          <div className="pcShow-kicker">▸ FEATURED</div>
          <GameLogo
            logoUrl={hero.logoUrl}
            title={hero.title}
            scale={2.4}
            logoClassName="pcShow-logo"
            titleClassName="pcShow-spot-title"
            titleSize={2}
          />
          <div className="pcShow-spot-tags">
            {hero.genre.toUpperCase()} · {hero.developer.toUpperCase()}
          </div>
          <PlayCta
            label={playState === "continue" ? "CONTINUE" : "PLAY"}
            className="pcShow-play"
          />
        </div>
      </div>
    </>
  )
}
