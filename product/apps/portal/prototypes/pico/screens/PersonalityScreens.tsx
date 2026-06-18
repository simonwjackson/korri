/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 * Gallery group: PERSONALITY — character experiments to give the OS a face:
 * the Pixl mascot, a signature launch ritual (cartridge insert + CRT power-on),
 * an arcade attract mode, and a voiced boot POST. Self-contained so the rest of
 * the gallery stays stable; motion lives in screens/personality.css (pcPer-).
 */
import { picoGames } from "../fixtures"
import { picoHero } from "../fixtures-extra"
import { PicoMascot } from "../PicoMascot"
import { Dim, PicoCart, Screen, Sub, Title } from "./kit"

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
  const game = picoHero ?? picoGames[0]
  return (
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
  )
}

export function AttractModeScreen() {
  const carts = picoGames.slice(0, 6)
  return (
    <Screen title="PICO ▸ ATTRACT" hints={[{ key: "a", label: "PRESS START" }]}>
      <div className="pcPer-attract">
        <div className="pcPer-stars" />
        <div className="pcPer-attract-mid">
          <div className="pcPer-logo">PICO</div>
          <div className="pcPer-attract-rail">
            {[...carts, ...carts].map((game, index) => (
              <div className="pcPer-attract-cart" key={`${game.id}-${index}`}>
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
