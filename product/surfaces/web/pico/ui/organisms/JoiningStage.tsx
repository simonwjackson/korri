/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * Joining a session: the host's cart, a connection stepper, and progress.
 */
import type { PicoGame } from "../../fixtures"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Dim } from "../atoms/Dim"
import { Progress } from "../atoms/Progress"
import { Title } from "../atoms/Title"
import { GameCartUnmarked } from "../molecules/GameCartUnmarked"

const JOIN_STEPS = ["FOUND", "HANDSHAKE", "SYNC", "READY"] as const

export function JoiningStage({
  game,
}: {
  readonly game: PicoGame | undefined
}) {
  return (
    <div
      className="pcMp-joining"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.joiningStage)}
    >
      {game?.art ? (
        <div className="pcMp-joining-art">
          <GameCartUnmarked game={game} />
        </div>
      ) : null}
      <Title size={1}>JOINING PIXELPETE’S GAME</Title>
      <div className="pcMp-steps">
        {JOIN_STEPS.map((step, index) => (
          <span
            key={step}
            className={`pcMp-step ${index < 2 ? "done" : ""} ${index === 2 ? "active" : ""}`}
          >
            {step}
          </span>
        ))}
      </div>
      <Progress pct={66} />
      <Dim>syncing save + handing you seat P2…</Dim>
    </div>
  )
}
