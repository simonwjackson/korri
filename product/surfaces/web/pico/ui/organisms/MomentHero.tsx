/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * Shared cinematic hero shell for SHOWCASE "moment" screens: full-bleed
 * pixelized key art + scrim + bottom-left kicker/logo/CTA. Layout in
 * screens/moments.css (pcM-). Moved from screens/MomentsScreens.tsx.
 */
import type { ReactNode } from "react"
import type { PicoGame } from "../../fixtures"
import { PicoArtImage } from "../../PicoArtImage"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import type { Hint } from "../templates/ScreenShell"
import { ScreenShell } from "../templates/ScreenShell"

export function MomentHero({
  statusTitle,
  hints,
  game,
  kicker,
  children,
}: {
  readonly statusTitle: string
  readonly hints: readonly Hint[]
  readonly game: PicoGame
  readonly kicker: ReactNode
  readonly children: ReactNode
}) {
  const backdrop = game.heroUrl ?? game.art
  return (
    <ScreenShell
      title={statusTitle}
      hints={hints}
      className="pad-0"
      partAttrs={picoDesignPartAttrs(PICO_DESIGN_PARTS.momentHero)}
    >
      <div className="pcM">
        {backdrop ? (
          <PicoArtImage
            src={backdrop}
            ratio={16 / 9}
            scale={2.8}
            className="pcM-bg"
          />
        ) : null}
        <div className="pcM-inner">
          <div className="pcM-kicker">{kicker}</div>
          {game.logoUrl ? (
            <PicoArtImage
              src={game.logoUrl}
              fit="contain"
              scale={3}
              className="pcM-logo"
            />
          ) : (
            <h1 className="pc-title pc-t3 pcM-title">{game.title}</h1>
          )}
          {children}
        </div>
      </div>
    </ScreenShell>
  )
}
