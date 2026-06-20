/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: molecule.
 *
 * Player chip with a swappable representation. The four reps let us compare how
 * players should read on screen (recolored Pixl / seat tag / avatar / pad).
 * Moved from `kit.tsx`.
 */
import type { ReactNode } from "react"
import type { PicoPlayer } from "../../fixtures-extra"
import { PicoArtImage } from "../../PicoArtImage"
import { PicoIcon } from "../../PicoIcon"
import { PicoMascot } from "../../PicoMascot"

export type PlayerRep = "mascot" | "tag" | "avatar" | "pad"

const PLAYER_SUB: Record<PicoPlayer["status"], string> = {
  host: "HOST",
  ready: "READY",
  joining: "JOINING…",
  open: "PRESS START",
}

function playerMark(player: PicoPlayer, rep: PlayerRep): ReactNode {
  if (player.status === "open") return <span className="pcPlayer-open">+</span>
  if (rep === "tag") return <span className="pcPlayer-tag">P{player.seat}</span>
  if (rep === "pad") return <PicoIcon name="pad" className="pcPlayer-pad" />
  if (rep === "avatar") {
    return player.avatar ? (
      <PicoArtImage src={player.avatar} ratio={1} className="pcPlayer-av" />
    ) : (
      <span className="pcPlayer-tag">P{player.seat}</span>
    )
  }
  return (
    <PicoMascot
      className="pcPlayer-pixl"
      state={player.status === "ready" ? "happy" : "idle"}
    />
  )
}

export function Player({
  player,
  rep = "mascot",
}: {
  readonly player: PicoPlayer
  readonly rep?: PlayerRep
}) {
  return (
    <span className={`pcPlayer p${player.seat} ${player.status}`}>
      <span className="pcPlayer-mark">{playerMark(player, rep)}</span>
      <span className="pcPlayer-name">
        {player.status === "open" ? "OPEN" : player.name}
      </span>
      <span className="pcPlayer-sub">{PLAYER_SUB[player.status]}</span>
    </span>
  )
}
