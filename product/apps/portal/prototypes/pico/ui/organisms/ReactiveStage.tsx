/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * The reactive home stage: Pixl gazing toward the focused cart, an interactive
 * cart rail, a caption, and the launch CRT overlay. Presentation only — the page
 * owns focus/launch state and passes it in with callbacks.
 */
import type { CSSProperties } from "react"
import type { PicoGame } from "../../fixtures"
import { PicoMascot } from "../../PicoMascot"
import { Dim } from "../atoms/Dim"
import { GameCart } from "../molecules/GameCart"

const cartReset: CSSProperties = {
  background: "transparent",
  border: "none",
  padding: 0,
  cursor: "pointer",
}

export function ReactiveStage({
  games,
  focus,
  gaze,
  launching,
  hero,
  onPick,
  onLaunch,
}: {
  readonly games: readonly PicoGame[]
  readonly focus: number
  /** -1 (left) .. 1 (right) — how far Pixl leans toward the focused cart. */
  readonly gaze: number
  readonly launching: boolean
  readonly hero: PicoGame | undefined
  readonly onPick: (index: number) => void
  readonly onLaunch: () => void
}) {
  return (
    <div className="pcPer-react">
      <div
        className="pcPer-react-pixl"
        style={{ transform: `translateX(${gaze * 16}%)` }}
      >
        <PicoMascot
          state={launching ? "happy" : "idle"}
          className="pcMascot-lg"
        />
      </div>
      <div className="pcPer-react-rail">
        {games.map((game, index) => (
          <button
            type="button"
            key={game.id}
            className={`pcPer-react-cart ${index === focus ? "on" : ""}`}
            onMouseEnter={() => onPick(index)}
            onFocus={() => onPick(index)}
            onClick={onLaunch}
            style={cartReset}
          >
            <GameCart game={game} showFav={false} />
          </button>
        ))}
      </div>
      <div className="pcPer-react-cap">
        <span className="pcPer-react-name">{hero?.title ?? "—"}</span>
        <Dim>
          {hero ? `${hero.genre} · ${hero.developer}` : ""} — hover a cart
        </Dim>
      </div>
      {launching && hero ? (
        <div className="pcPer-react-crt" key={hero.id}>
          <div className="pcPer-react-crt-line" />
          <div className="pcPer-react-crt-msg">LAUNCHING {hero.title}</div>
        </div>
      ) : null}
    </div>
  )
}
