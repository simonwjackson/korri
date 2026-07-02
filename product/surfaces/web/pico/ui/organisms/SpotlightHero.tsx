/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * The Spotlight home's featured-game hero: key-art backdrop + cartridge + an
 * info column (kicker / logo / tags / play CTA). Renders a fragment — the
 * backdrop and the hero block must stay direct children of the `.pcShow-spot`
 * stage so their absolute positioning resolves against it.
 */
import type { PicoGame } from "../../fixtures"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
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
        partAttrs={picoDesignPartAttrs(PICO_DESIGN_PARTS.spotlightHero)}
      />
      <div
        className="pcShow-spot-bg"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcShowSpotBg)}
      />
      {/* key remounts the hero each rotation so the pop-in re-fires */}
      <div
        className="pcShow-spot-hero"
        key={hero.id}
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcShowSpotHero)}
      >
        <div
          className="pcShow-spot-art"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcShowSpotArt)}
        >
          <GameCartUnmarked game={hero} />
        </div>
        <div
          className="pcShow-spot-info"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcShowSpotInfo)}
        >
          <div
            className="pcShow-kicker"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcShowKicker)}
          >
            ▸ FEATURED
          </div>
          <GameLogo
            logoUrl={hero.logoUrl}
            title={hero.title}
            scale={2.4}
            logoClassName="pcShow-logo"
            titleClassName="pcShow-spot-title"
            titleSize={2}
          />
          <div
            className="pcShow-spot-tags"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcShowSpotTags)}
          >
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
