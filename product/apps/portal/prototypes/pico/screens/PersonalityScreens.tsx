/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 * Gallery group: PERSONALITY — character experiments to give the OS a face:
 * the Pixl mascot, a signature launch ritual (cartridge insert + CRT power-on),
 * an arcade attract mode, and a voiced boot POST. Self-contained so the rest of
 * the gallery stays stable; motion lives in screens/personality.css (pcPer-).
 *
 * Data comes from PicoLibrary via atoms (never a fixture import).
 */
import type { CSSProperties } from "react"
import { useState } from "react"
import {
  picoGamesAtom,
  picoHeroAtom,
} from "../data/pico-library-atoms"
import type { PicoGame } from "../fixtures"
import { PicoMascot } from "../PicoMascot"
import { sfx } from "../pico-sfx"
import { PicoData } from "./PicoData"
import { Dim, PicoCart, Screen, Sub, Title } from "./kit"

/**
 * The "woven in + reactive" demo: an actually-interactive home. Hover/click a
 * cart to focus it — Pixl gazes toward it (and chirps), the caption updates, and
 * selecting fires the launch ritual (CRT power-on) with a fanfare. Personality
 * in context, not a museum exhibit.
 */
export function ReactiveHomeScreen() {
  return (
    <PicoData atom={picoGamesAtom} title="PICO ▸ HOME">
      {games => <ReactiveHomeBody allGames={games} />}
    </PicoData>
  )
}

function ReactiveHomeBody({
  allGames,
}: {
  readonly allGames: readonly PicoGame[]
}) {
  const games = allGames.slice(0, 5)
  const [focus, setFocus] = useState(2)
  const [launching, setLaunching] = useState(false)
  const hero = games[focus]
  const mid = (games.length - 1) / 2
  const gaze = mid === 0 ? 0 : (focus - mid) / mid // -1 (left) .. 1 (right)

  function pick(index: number) {
    if (index === focus) return
    setFocus(index)
    sfx.move()
  }
  function launch() {
    if (launching) return
    sfx.launch()
    setLaunching(true)
    window.setTimeout(() => setLaunching(false), 2200)
  }

  return (
    <Screen
      title="PICO ▸ HOME"
      hints={[
        { key: "a", label: "PLAY" },
        { key: "y", label: "INFO" },
        { key: "b", label: "BACK" },
      ]}
    >
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
              onMouseEnter={() => pick(index)}
              onFocus={() => pick(index)}
              onClick={launch}
              style={cartReset}
            >
              <PicoCart game={game} showFav={false} />
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
    </Screen>
  )
}

const cartReset: CSSProperties = {
  background: "transparent",
  border: "none",
  padding: 0,
  cursor: "pointer",
}

const MOODS = [
  { state: "idle" as const, label: "IDLE" },
  { state: "happy" as const, label: "HAPPY" },
  { state: "sleep" as const, label: "SLEEPY" },
  { state: "peek" as const, label: "WINK" },
]

export function MascotScreen() {
  return (
    <Screen
      title="PICO ▸ PALS"
      hints={[
        { key: "a", label: "PET" },
        { key: "b", label: "BACK" },
      ]}
      className="center"
    >
      <PicoMascot state="happy" className="pcMascot-xl" />
      <Title size={2}>MEET PIXL</Title>
      <Sub>your console's little buddy</Sub>
      <p className="pc-hero-msg">
        Pixl lives in the status bar — blinking, bobbing, dozing off when you
        idle, and perking up when something good happens.
      </p>
      <div className="pcPer-moods">
        {MOODS.map(mood => (
          <div className="pcPer-mood" key={mood.label}>
            <PicoMascot state={mood.state} className="pcMascot-lg" />
            <span className="pcPer-mood-label">{mood.label}</span>
          </div>
        ))}
      </div>
    </Screen>
  )
}

export function LaunchRitualScreen() {
  return (
    <PicoData atom={picoHeroAtom} title="PICO ▸ LAUNCH">
      {game => (
        <Screen
          title="PICO ▸ LAUNCH"
          hints={[{ key: "b", label: "BACK" }]}
          className="center"
        >
          <div className="pcPer-ritual">
            <div className="pcPer-tube">
              <div className="pcPer-slot" />
              {game ? (
                <div className="pcPer-cart">
                  <PicoCart game={game} showFav={false} />
                </div>
              ) : null}
              <div className="pcPer-power">
                <div className="pcPer-power-line" />
                <div className="pcPer-power-game">
                  <div className="pcPer-power-title">NOW PLAYING</div>
                  <div className="pcPer-power-name">{game?.title ?? "GAME"}</div>
                </div>
              </div>
            </div>
          </div>
          <Dim>cartridge insert → CRT power-on</Dim>
        </Screen>
      )}
    </PicoData>
  )
}

export function AttractModeScreen() {
  return (
    <PicoData atom={picoGamesAtom} title="PICO ▸ ATTRACT">
      {games => {
        const carts = games.slice(0, 6)
        return (
          <Screen
            title="PICO ▸ ATTRACT"
            hints={[{ key: "a", label: "PRESS START" }]}
          >
            <div className="pcPer-attract">
              <div className="pcPer-stars" />
              <div className="pcPer-attract-mid">
                <div className="pcPer-logo">PICO</div>
                <div className="pcPer-attract-rail">
                  {[...carts, ...carts].map((game, index) => (
                    <div
                      className="pcPer-attract-cart"
                      key={`${game.id}-${index}`}
                    >
                      <PicoCart game={game} showFav={false} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="pcPer-hiscore">
                <span>HI-SCORE 999999</span>
                <span className="pcPer-press">PRESS START</span>
              </div>
            </div>
          </Screen>
        )
      }}
    </PicoData>
  )
}

const BOOT_LINES: readonly string[] = [
  "PICO-8 OS  v2.4.1",
  "CPU ........ OK",
  "MEM 64K .... OK",
  "DISPLAY .... OK",
  "INPUT ...... OK",
  "CARTS ...... 247 FOUND",
  "DUSTING OFF CARTS…",
  "WAKING UP…",
  "READY.",
]

export function BootPostScreen() {
  return (
    <Screen hints={[{ key: "a", label: "SKIP" }]} className="pad-0">
      <div className="pcPer-post">
        <PicoMascot state="idle" className="pcMascot-lg pcPer-post-pixl" />
        <pre className="pcPer-post-lines">
          {BOOT_LINES.map((line, index) => (
            <span
              className="pcPer-post-line"
              style={{ animationDelay: `${index * 0.28}s` }}
              key={line}
            >
              {line}
            </span>
          ))}
        </pre>
        <span className="pcPer-post-caret">█</span>
      </div>
    </Screen>
  )
}
