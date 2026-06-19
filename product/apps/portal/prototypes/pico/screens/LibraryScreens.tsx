/**
 * PROTOTYPE — pico theme. Throwaway. Gallery group: LIBRARY — the home
 * coverflow rail, console picker, collections, continue-playing, search (with
 * 8-bit keyboard) and its empty state, filter/sort overlay, plus the standard
 * loading / empty / error / defect states. The browsing surfaces a player sees
 * before launching anything. Composed from screens/kit.tsx; screen-specific
 * layout in screens/library.css (namespace pcLib-).
 *
 * Data comes from PicoLibrary / PicoCatalog via atoms (never a fixture import).
 * The loading / error / empty / defect demo screens SEED a PicoLibrary behavior
 * layer (`loading-forever` / `fail-list` / `empty` / `defect`) and let
 * `AsyncResult` branch — exactly how the real app seeds route layers — instead
 * of bespoke state props.
 */
import { picoSystemsAtom } from "../data/pico-catalog-atoms"
import {
  picoGamesAtom,
  picoLibraryLayerAtom,
  picoRecentAtom,
} from "../data/pico-library-atoms"
import { makePicoLibraryLayer } from "../data/pico-library-service"
import { PicoData } from "./PicoData"
import {
  Badge,
  Btn,
  Chip,
  Dim,
  Hero,
  List,
  Opt,
  PicoCart,
  PicoIcon,
  Row,
  Screen,
  Stat,
  Sub,
  Title,
  Toggle,
} from "./kit"

const COLLECTIONS: readonly {
  readonly name: string
  readonly count: number
}[] = [
  { name: "FAVORITES", count: 12 },
  { name: "RECENTLY ADDED", count: 24 },
  { name: "CO-OP NIGHT", count: 8 },
  { name: "SPEEDRUN", count: 15 },
  { name: "HIDDEN GEMS", count: 6 },
]

const KEY_ROWS: readonly string[] = [
  "ABCDEFGHIJ",
  "KLMNOPQRST",
  "UVWXYZ0123",
  "456789",
]

export function HomeRailScreen() {
  return (
    <PicoData atom={picoGamesAtom} title="PICO ▸ HOME">
      {games => {
        const rail = games.slice(0, 5)
        const focused = rail[2] ?? games[0]
        if (!focused) return null
        return (
          <Screen
            title="PICO ▸ HOME"
            hints={[
              { key: "a", label: "PLAY" },
              { key: "y", label: "OPTIONS" },
            ]}
          >
            <div className="pcLib-coverflow">
              {rail.map((game, index) => (
                <div
                  key={game.id}
                  className={`pcLib-cart ${index === 2 ? "focused" : ""}`}
                >
                  <PicoCart game={game} />
                </div>
              ))}
            </div>
            <div className="pcLib-caption">
              <Title size={1}>{focused.title}</Title>
              <Sub>{focused.genre}</Sub>
              <div className="pc-dim">
                {focused.lastPlayedLabel
                  ? `LAST PLAYED ${focused.lastPlayedLabel}`
                  : "NEVER PLAYED"}
              </div>
            </div>
          </Screen>
        )
      }}
    </PicoData>
  )
}

export function ConsolePickerScreen() {
  return (
    <PicoData atom={picoSystemsAtom} title="PICO ▸ SYSTEMS">
      {systems => (
        <Screen
          title="PICO ▸ SYSTEMS"
          hints={[
            { key: "a", label: "OPEN" },
            { key: "b", label: "BACK" },
          ]}
        >
          <Title size={0}>CHOOSE A SYSTEM</Title>
          <div className="pcLib-systems">
            {systems.map((system, index) => (
              <div
                key={system.id}
                className={`pcLib-system ${index === 0 ? "sel" : ""}`}
              >
                <div className="pcLib-system-name">{system.name}</div>
                <Stat label="GAMES" value={system.count} />
              </div>
            ))}
          </div>
        </Screen>
      )}
    </PicoData>
  )
}

export function CollectionsScreen() {
  return (
    <Screen
      title="PICO ▸ COLLECTIONS"
      hints={[
        { key: "a", label: "OPEN" },
        { key: "y", label: "NEW" },
      ]}
    >
      <Title size={0}>COLLECTIONS</Title>
      <List>
        {COLLECTIONS.map((collection, index) => (
          <Row
            key={collection.name}
            icon="▣"
            label={collection.name}
            trailing={<Badge tone="accent">{collection.count}</Badge>}
            sel={index === 0}
          />
        ))}
      </List>
    </Screen>
  )
}

export function ContinuePlayingScreen() {
  return (
    <PicoData atom={picoRecentAtom} title="PICO ▸ CONTINUE">
      {recent => {
        const rail = recent.slice(0, 5)
        return (
          <Screen
            title="PICO ▸ CONTINUE"
            hints={[
              { key: "a", label: "RESUME" },
              { key: "b", label: "BACK" },
            ]}
          >
            <Title size={0}>CONTINUE PLAYING</Title>
            <List>
              {rail.map((game, index) => (
                <Row
                  key={game.id}
                  icon={<PicoCart game={game} showFav={false} />}
                  label={game.title}
                  meta={
                    game.lastPlayedLabel
                      ? `LAST PLAYED ${game.lastPlayedLabel}`
                      : "RESUME"
                  }
                  trailing={<Dim>{game.playtimeLabel ?? "—"}</Dim>}
                  sel={index === 0}
                />
              ))}
            </List>
          </Screen>
        )
      }}
    </PicoData>
  )
}

export function SearchScreen() {
  return (
    <PicoData atom={picoGamesAtom} title="PICO ▸ SEARCH">
      {games => {
        const results = games.slice(0, 3)
        return (
          <Screen
            title="PICO ▸ SEARCH"
            hints={[
              { key: "a", label: "TYPE" },
              { key: "y", label: "DELETE" },
            ]}
          >
            <div className="pcLib-query">
              <span className="pcLib-query-text">METRO</span>
              <span className="pcLib-caret">▌</span>
            </div>
            <div className="pcLib-keyboard">
              {KEY_ROWS.map(row => (
                <div key={row} className="pcLib-keyrow">
                  {[...row].map(char => (
                    <span key={char} className="pcLib-key">
                      {char}
                    </span>
                  ))}
                </div>
              ))}
            </div>
            <List>
              {results.map(game => (
                <Row
                  key={game.id}
                  icon={<PicoIcon name="play" />}
                  label={game.title}
                  meta={game.genre}
                />
              ))}
            </List>
          </Screen>
        )
      }}
    </PicoData>
  )
}

export function SearchEmptyScreen() {
  return (
    <Screen
      title="PICO ▸ SEARCH"
      hints={[
        { key: "a", label: "TYPE" },
        { key: "b", label: "CLEAR" },
      ]}
    >
      <div className="pcLib-query">
        <span className="pcLib-query-text">ZXQWPLK</span>
        <span className="pcLib-caret">▌</span>
      </div>
      <Hero
        glyph="○"
        glyphTone="info"
        title="NO RESULTS"
        message="nothin' matches “ZXQWPLK” — try fewer letters, or poke a different system?"
      />
    </Screen>
  )
}

export function FilterSortScreen() {
  return (
    <Screen
      title="PICO ▸ FILTER & SORT"
      hints={[
        { key: "a", label: "APPLY" },
        { key: "b", label: "CANCEL" },
      ]}
    >
      <Title size={0}>FILTER & SORT</Title>
      <div className="pcLib-section">
        <div className="pc-card-title">GENRE</div>
        <div className="pc-wrap">
          <Chip>PLATFORMER</Chip>
          <Chip>RPG</Chip>
          <Chip>SHMUP</Chip>
          <Chip>PUZZLE</Chip>
          <Chip>ACTION</Chip>
        </div>
      </div>
      <div className="pcLib-section">
        <div className="pc-card-title">SORT</div>
        <Opt value="RECENT" />
        <div className="pcLib-sort-rest">
          <Dim>A-Z</Dim>
          <Dim>PLAYTIME</Dim>
        </div>
      </div>
      <div className="pcLib-section">
        <div className="pc-card-title">TOGGLES</div>
        <Row label="INSTALLED ONLY" trailing={<Toggle on={true} />} />
        <Row label="FAVORITES ONLY" trailing={<Toggle on={false} />} />
      </div>
    </Screen>
  )
}

/** Seeds the `loading-forever` behavior layer; `list()` never resolves, so the
 * AsyncResult stays waiting and renders the loading hero. */
export function LibraryLoadingScreen() {
  return (
    <PicoData
      atom={picoGamesAtom}
      seed={[[picoLibraryLayerAtom, makePicoLibraryLayer("loading-forever")]]}
      waiting={() => (
        <Screen title="PICO ▸ LIBRARY" className="center">
          <Hero spinner title="LOADING LIBRARY…" message="waking up the carts…" />
        </Screen>
      )}
    >
      {() => null}
    </PicoData>
  )
}

/** Seeds the `empty` behavior layer; `list()` succeeds with no carts. */
export function LibraryEmptyScreen() {
  return (
    <PicoData
      atom={picoGamesAtom}
      seed={[[picoLibraryLayerAtom, makePicoLibraryLayer("empty")]]}
    >
      {() => (
        <Screen
          title="PICO ▸ LIBRARY"
          hints={[{ key: "a", label: "ADD" }]}
          className="center"
        >
          <Hero
            glyph="◰"
            glyphTone="info"
            title="NO GAMES YET"
            message="no carts on the shelf yet — add a source and Korri will go dig some up."
          >
            <Btn kind="primary">
              <PicoIcon name="plus" /> ADD A SOURCE
            </Btn>
          </Hero>
        </Screen>
      )}
    </PicoData>
  )
}

/** Seeds the `fail-list` behavior layer; `list()` fails with PicoLibraryError. */
export function LibraryErrorScreen() {
  return (
    <PicoData
      atom={picoGamesAtom}
      seed={[[picoLibraryLayerAtom, makePicoLibraryLayer("fail-list")]]}
      error={() => (
        <Screen
          tone="alert"
          title="PICO ▸ LIBRARY"
          hints={[
            { key: "a", label: "RETRY" },
            { key: "b", label: "BACK" },
          ]}
          className="center"
        >
          <Hero
            glyph="⚠"
            glyphTone="bad"
            title="COULD NOT LOAD LIBRARY"
            message="couldn't find your stash — check the host's plugged in and give it another go?"
          >
            <Btn kind="primary">
              <PicoIcon name="restart" /> RETRY
            </Btn>
          </Hero>
        </Screen>
      )}
    >
      {() => null}
    </PicoData>
  )
}

/** Seeds the `defect` behavior layer; `list()` dies (unexpected defect). */
export function LibraryDefectScreen() {
  return (
    <PicoData
      atom={picoGamesAtom}
      seed={[[picoLibraryLayerAtom, makePicoLibraryLayer("defect")]]}
      defect={() => (
        <Screen
          tone="alert"
          title="PICO ▸ LIBRARY"
          hints={[{ key: "a", label: "RESTART" }]}
          className="center"
        >
          <Hero
            glyph={<PicoIcon name="close" />}
            glyphTone="bad"
            title="UNEXPECTED DEFECT"
            message="somethin' glitched out drawing the library. blow on the cartridge and restart?"
          >
            <Btn kind="primary">
              <PicoIcon name="restart" /> RESTART KORRI
            </Btn>
          </Hero>
        </Screen>
      )}
    >
      {() => null}
    </PicoData>
  )
}
