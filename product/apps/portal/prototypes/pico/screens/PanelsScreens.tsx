/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 * Gallery group: PANELS — side panels that PUSH the UI aside (not overlay it).
 * The main pane is its own `container-type: size` query container, so when the
 * drawer claims a slice of width the content re-derives its intrinsic scale and
 * reflows (carts shrink / rewrap) instead of being covered. One shared
 * `PanelScreen` shell (open / side / contents); each screen is just different
 * panel contents. Layout in screens/panels.css (namespace pcPanel- / pc*-).
 */
import type { ReactNode } from "react"
import { picoGamesAtom } from "../data/pico-library-atoms"
import type { PicoGame } from "../fixtures"
import type { PicoPlayer } from "../fixtures-extra"
import { PicoArtImage } from "../PicoArtImage"
import { PicoCart } from "../PicoCart"
import { PicoIcon } from "../PicoIcon"
import { PicoMascot } from "../PicoMascot"
import { BlockBar } from "../ui/atoms/BlockBar"
import { Btn } from "../ui/atoms/Btn"
import { Chip } from "../ui/atoms/Chip"
import { Stat } from "../ui/atoms/Stat"
import { Toggle } from "../ui/atoms/Toggle"
import { Opt } from "../ui/molecules/Opt"
import { Player } from "../ui/molecules/Player"
import { ScreenShell as Screen } from "../ui/templates/ScreenShell"
import { PicoData } from "./PicoData"

type Hint = { readonly key: "a" | "b" | "y"; readonly label: string }

/** The reusable push-drawer shell. `side` picks which edge it docks to. */
function PanelScreen({
  title,
  hints,
  side = "right",
  panelTitle,
  main,
  panel,
}: {
  readonly title: string
  readonly hints: readonly Hint[]
  readonly side?: "left" | "right"
  readonly panelTitle: string
  readonly main: ReactNode
  readonly panel: ReactNode
}) {
  return (
    <Screen title={title} hints={hints} className="pad-0">
      <div className={`pcPanel ${side}`}>
        <div className="pcPanel-main">{main}</div>
        <aside className={`pcPanel-aside ${side}`}>
          <div className="pcPanel-head">{panelTitle}</div>
          <div className="pcPanel-body">{panel}</div>
        </aside>
      </div>
    </Screen>
  )
}

/** The squeezed-home content: a wrap of carts authored in cqh, so it reflows to
 * the narrower main pane when the drawer is open. */
function MiniHome({
  games,
  focusIndex,
}: {
  readonly games: readonly PicoGame[]
  readonly focusIndex?: number
}) {
  return (
    <div className="pcHome">
      <div className="pcHome-title">CONTINUE</div>
      <div className="pcHome-grid">
        {games.slice(0, 10).map((game, index) => (
          <div
            key={game.id}
            className={`pcHome-cart ${index === focusIndex ? "on" : ""}`}
          >
            <PicoCart game={game} showFav={false} />
          </div>
        ))}
      </div>
    </div>
  )
}

function PanelDemo({
  title,
  children,
}: {
  readonly title: string
  readonly children: (games: readonly PicoGame[]) => ReactNode
}) {
  return (
    <PicoData atom={picoGamesAtom} title={title}>
      {games => children(games)}
    </PicoData>
  )
}

/* ── 1. Quick Menu / Control Center (right) ───────────────────────────────── */
function ControlCenter() {
  return (
    <div className="pcCC">
      <div className="pcCC-profile">
        <PicoMascot state="happy" className="pcCC-pixl" />
        <div className="pcCC-who">
          <b>PLAYER 1</b>
          <span>signed in</span>
        </div>
      </div>
      <div className="pcCC-row">
        <span>BRIGHTNESS</span>
        <BlockBar level={7} max={10} />
      </div>
      <div className="pcCC-row">
        <span>VOLUME</span>
        <BlockBar level={4} max={10} />
      </div>
      <div className="pcCC-row">
        <span>WIFI</span>
        <Toggle on />
      </div>
      <div className="pcCC-row">
        <span>AIRPLANE</span>
        <Toggle on={false} />
      </div>
      <div className="pcCC-tiles">
        <div className="pcCC-tile">
          <PicoIcon name="gear" />
          <span>SETTINGS</span>
        </div>
        <div className="pcCC-tile">
          <PicoIcon name="moon" />
          <span>SLEEP</span>
        </div>
        <div className="pcCC-tile">
          <PicoIcon name="restart" />
          <span>RESTART</span>
        </div>
        <div className="pcCC-tile">
          <PicoIcon name="power" />
          <span>POWER</span>
        </div>
      </div>
    </div>
  )
}

export function QuickMenuPanelScreen() {
  return (
    <PanelDemo title="PICO ▸ QUICK MENU">
      {games => (
        <PanelScreen
          title="PICO ▸ QUICK MENU"
          hints={[
            { key: "a", label: "SELECT" },
            { key: "b", label: "CLOSE" },
          ]}
          side="right"
          panelTitle="CONTROL CENTER"
          main={<MiniHome games={games} />}
          panel={<ControlCenter />}
        />
      )}
    </PanelDemo>
  )
}

/* ── 2. Game Quick-Look (right) ───────────────────────────────────────────── */
function QuickLook({ game }: { readonly game: PicoGame }) {
  return (
    <div className="pcQL">
      {game.art ? <PicoArtImage src={game.art} className="pcQL-art" /> : null}
      <div className="pcQL-title">{game.title}</div>
      <div className="pcQL-meta">
        {game.genre.toUpperCase()} · {game.developer.toUpperCase()}
      </div>
      <div className="pcQL-stats">
        <Stat label="played" value={game.playtimeLabel ?? "—"} />
        <Stat label="last" value={game.lastPlayedLabel ?? "new"} />
      </div>
      <Btn kind="primary">
        <PicoIcon name="play" /> CONTINUE
      </Btn>
      <Btn>RELEASES</Btn>
    </div>
  )
}

export function GameQuickLookPanelScreen() {
  const focus = 2
  return (
    <PanelDemo title="PICO ▸ HOME">
      {games => {
        const game = games[focus] ?? games[0]
        return (
          <PanelScreen
            title="PICO ▸ HOME"
            hints={[
              { key: "a", label: "CONTINUE" },
              { key: "y", label: "INFO" },
              { key: "b", label: "CLOSE" },
            ]}
            side="right"
            panelTitle="QUICK LOOK"
            main={<MiniHome games={games} focusIndex={focus} />}
            panel={game ? <QuickLook game={game} /> : null}
          />
        )
      }}
    </PanelDemo>
  )
}

/* ── 3. Friends / Party rail (right) ──────────────────────────────────────── */
const FRIENDS: readonly {
  readonly id: string
  readonly name: string
  readonly status: "playing" | "online" | "away" | "offline"
  readonly playing: string | null
}[] = [
  { id: "f1", name: "PIXELPETE", status: "playing", playing: "Celeste" },
  { id: "f2", name: "RETRORHEA", status: "playing", playing: "Hollow Knight" },
  { id: "f3", name: "8BITBEN", status: "online", playing: null },
  { id: "f4", name: "MEGAMARA", status: "away", playing: null },
  { id: "f5", name: "VECTORVIV", status: "offline", playing: null },
]
function FriendsPanel() {
  return (
    <div className="pcFr">
      {FRIENDS.map(friend => (
        <div key={friend.id} className={`pcFr-row ${friend.status}`}>
          <span className={`pcMp-pres ${friend.status}`} />
          <div className="pcFr-text">
            <b>{friend.name}</b>
            <span>
              {friend.playing ? `playing ${friend.playing}` : friend.status}
            </span>
          </div>
          {friend.status !== "offline" ? (
            <span className="pcFr-cta">
              {friend.playing ? "JOIN" : "INVITE"}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  )
}

export function FriendsPanelScreen() {
  return (
    <PanelDemo title="PICO ▸ HOME">
      {games => (
        <PanelScreen
          title="PICO ▸ HOME"
          hints={[
            { key: "a", label: "JOIN" },
            { key: "b", label: "CLOSE" },
          ]}
          side="right"
          panelTitle="FRIENDS"
          main={<MiniHome games={games} />}
          panel={<FriendsPanel />}
        />
      )}
    </PanelDemo>
  )
}

/* ── 4. Filters & Collections (left) ──────────────────────────────────────── */
const SYSTEMS: readonly string[] = [
  "ALL GAMES",
  "FAVORITES",
  "SUPER NES",
  "NES",
  "GAME BOY ADV",
  "PORTMASTER",
]
function FiltersPanel() {
  return (
    <div className="pcFil">
      <div className="pcFil-section">SYSTEMS</div>
      <div className="pcFil-list">
        {SYSTEMS.map((system, index) => (
          <div key={system} className={`pcFil-item ${index === 0 ? "on" : ""}`}>
            {system}
          </div>
        ))}
      </div>
      <div className="pcFil-section">GENRE</div>
      <div className="pcFil-chips">
        {["ACTION", "PUZZLE", "RPG", "RACING", "CO-OP"].map(genre => (
          <Chip key={genre}>{genre}</Chip>
        ))}
      </div>
      <div className="pcFil-section">SORT</div>
      <Opt value="RECENT" />
    </div>
  )
}

export function FiltersPanelScreen() {
  return (
    <PanelDemo title="PICO ▸ LIBRARY">
      {games => (
        <PanelScreen
          title="PICO ▸ LIBRARY"
          hints={[
            { key: "a", label: "APPLY" },
            { key: "b", label: "CLOSE" },
          ]}
          side="left"
          panelTitle="FILTERS"
          main={<MiniHome games={games} />}
          panel={<FiltersPanel />}
        />
      )}
    </PanelDemo>
  )
}

/* ── 5. Now-Playing dock (right) ──────────────────────────────────────────── */
const NOW_PLAYERS: readonly PicoPlayer[] = [
  { id: "p1", name: "YOU", seat: 1, status: "host", controller: "HANDHELD" },
  {
    id: "p2",
    name: "PIXELPETE",
    seat: 2,
    status: "ready",
    controller: "GAMEPAD",
  },
]
function RunningGame({ game }: { readonly game: PicoGame }) {
  const backdrop = game.heroUrl ?? game.art
  return (
    <div className="pcNow-stage">
      {backdrop ? (
        <PicoArtImage
          src={backdrop}
          ratio={16 / 9}
          scale={2.8}
          className="pcNow-bg"
        />
      ) : null}
      <div className="pcNow-tag">
        <span className="pcNow-dot" /> RUNNING · {game.title.toUpperCase()}
      </div>
    </div>
  )
}
function SessionDock() {
  return (
    <div className="pcNow-dock">
      <div className="pcNow-sect">PLAYERS</div>
      <div className="pcNow-players">
        {NOW_PLAYERS.map(player => (
          <Player key={player.id} player={player} rep="tag" />
        ))}
      </div>
      <div className="pcNow-sect">SAVE</div>
      <div className="pcNow-saves">
        {["CITY OF TEARS", "BOSS RUSH", "AUTO"].map((slot, index) => (
          <div key={slot} className={`pcNow-save ${index === 0 ? "on" : ""}`}>
            {slot}
          </div>
        ))}
      </div>
      <div className="pcNow-sect">PERF</div>
      <div className="pcNow-stats">
        <Stat label="fps" value="60" />
        <Stat label="°c" value="62" />
        <Stat label="batt" value="82%" />
      </div>
      <div className="pcNow-actions">
        <Btn kind="primary">RESUME</Btn>
        <Btn kind="danger">QUIT</Btn>
      </div>
    </div>
  )
}

export function NowPlayingPanelScreen() {
  return (
    <PanelDemo title="PICO ▸ PLAYING">
      {games => {
        const game = games[4] ?? games[0]
        return (
          <PanelScreen
            title="PICO ▸ PLAYING"
            hints={[
              { key: "a", label: "RESUME" },
              { key: "b", label: "QUIT" },
            ]}
            side="right"
            panelTitle="SESSION"
            main={game ? <RunningGame game={game} /> : null}
            panel={<SessionDock />}
          />
        )
      }}
    </PanelDemo>
  )
}
