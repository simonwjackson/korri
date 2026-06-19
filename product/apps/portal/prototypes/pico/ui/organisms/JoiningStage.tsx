/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * Joining a session: the host's cart, a connection stepper, and progress.
 */
import type { PicoGame } from "../../fixtures"
import { Dim, Progress } from "../../screens/kit"
import { Title } from "../atoms/Title"
import { GameCart } from "../molecules/GameCart"

const JOIN_STEPS = ["FOUND", "HANDSHAKE", "SYNC", "READY"] as const

export function JoiningStage({ game }: { readonly game: PicoGame | undefined }) {
  return (
    <div className="pcMp-joining">
      {game?.art ? (
        <div className="pcMp-joining-art">
          <GameCart game={game} showFav={false} />
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
