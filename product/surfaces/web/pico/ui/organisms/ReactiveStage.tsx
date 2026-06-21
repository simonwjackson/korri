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
import { GameCartUnmarked } from "../molecules/GameCartUnmarked"

const cartReset: CSSProperties = {
  background: "transparent",
  border: "none",
  padding: 0,
  cursor: "pointer",
}

export type ReactiveStageState =
  | { readonly _tag: "Browsing"; readonly hero?: PicoGame }
  | { readonly _tag: "Launching"; readonly hero: PicoGame }

export function ReactiveStage({
  games,
  focus,
  gaze,
  state,
  onPick,
  onLaunch,
}: {
  readonly games: readonly PicoGame[]
  readonly focus: number
  /** -1 (left) .. 1 (right) — how far Pixl leans toward the focused cart. */
  readonly gaze: number
  readonly state: ReactiveStageState
  readonly onPick: (index: number) => void
  readonly onLaunch: () => void
}) {
  const hero = state.hero
  return (
    <div className="pcPer-react">
      <div
        className="pcPer-react-pixl"
        style={{ transform: `translateX(${gaze * 16}%)` }}
      >
        <PicoMascot
          state={state._tag === "Launching" ? "happy" : "idle"}
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
            <GameCartUnmarked game={game} />
          </button>
        ))}
      </div>
      <div className="pcPer-react-cap">
        <span className="pcPer-react-name">{hero?.title ?? "—"}</span>
        <Dim>
          {hero ? `${hero.genre} · ${hero.developer}` : ""} — hover a cart
        </Dim>
      </div>
      {state._tag === "Launching" ? (
        <div className="pcPer-react-crt" key={state.hero.id}>
          <div className="pcPer-react-crt-line" />
          <div className="pcPer-react-crt-msg">
            LAUNCHING {state.hero.title}
          </div>
        </div>
      ) : null}
    </div>
  )
}
