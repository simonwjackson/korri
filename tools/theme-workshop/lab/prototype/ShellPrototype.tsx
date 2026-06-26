/**
 * dev-lab shell prototype — DIRECTION ONLY, throwaway.
 *
 * Purpose: explore a clean, Photoshop-style chrome for the design tool that
 * (a) docks/floats panels, (b) lets you drag things around at will, and
 * (c) toggles fully away to a bare canvas. Three switchable directions:
 *   - Dock   : classic editor — left tool rail, right docked inspector stack.
 *   - Float  : free studio — glassy panels you drag anywhere over the canvas.
 *   - Focus  : canvas-first — chrome melts to a single slim command rail.
 *
 * Press [Tab] to toggle all chrome. Drag any panel by its title bar.
 * Served by the running `just dev-lab` server at /prototype/.
 */

import {
  type CSSProperties,
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"

type KnobState = {
  base: number
  ratio: number
  space: number
  radius: number
  accent: string
}
const DEFAULT_KNOBS: KnobState = {
  base: 16,
  ratio: 1.4,
  space: 1,
  radius: 10,
  accent: "#7dd3fc",
}

type Variant = "dock" | "float" | "focus"

type Pos = { x: number; y: number }

// ---------------------------------------------------------------------------
// Draggable primitive
// ---------------------------------------------------------------------------

function useDraggable(initial: Pos) {
  const [pos, setPos] = useState<Pos>(initial)
  const posRef = useRef(initial)
  posRef.current = pos

  // Re-seat when a variant hands us a new starting position.
  const lastInitial = useRef(initial)
  useEffect(() => {
    if (
      lastInitial.current.x !== initial.x ||
      lastInitial.current.y !== initial.y
    ) {
      lastInitial.current = initial
      setPos(initial)
    }
  }, [initial])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    const startX = e.clientX
    const startY = e.clientY
    const base = posRef.current
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    const move = (ev: PointerEvent) => {
      const x = Math.max(
        0,
        Math.min(window.innerWidth - 60, base.x + ev.clientX - startX),
      )
      const y = Math.max(
        0,
        Math.min(window.innerHeight - 30, base.y + ev.clientY - startY),
      )
      setPos({ x, y })
    }
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }, [])

  return { pos, onPointerDown }
}

function FloatingPanel({
  title,
  initial,
  width,
  accent,
  children,
}: {
  title: string
  initial: Pos
  width: number
  accent?: string
  children: ReactNode
}) {
  const { pos, onPointerDown } = useDraggable(initial)
  const [collapsed, setCollapsed] = useState(false)
  const style: CSSProperties = { left: pos.x, top: pos.y, width }
  return (
    <section className="pt-panel" style={style}>
      <header className="pt-panel-bar" onPointerDown={onPointerDown}>
        {accent ? (
          <span className="pt-panel-dot" style={{ background: accent }} />
        ) : null}
        <span className="pt-panel-title">{title}</span>
        <button
          type="button"
          className="pt-panel-collapse"
          onPointerDown={e => e.stopPropagation()}
          onClick={() => setCollapsed(c => !c)}
          aria-label={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? "+" : "–"}
        </button>
      </header>
      {collapsed ? null : <div className="pt-panel-body">{children}</div>}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Panel content
// ---------------------------------------------------------------------------

const PARTS_TREE: { layer: string; items: string[] }[] = [
  { layer: "Atoms", items: ["Pill", "Tile", "Chip", "Badge", "Button"] },
  { layer: "Molecules", items: ["Search Pill", "Meta Row", "Rating"] },
  { layer: "Organisms", items: ["Home Rail", "Hero Banner"] },
  { layer: "Templates", items: ["Home Root", "Detail Root"] },
  { layer: "Pages", items: ["Cinematic Home", "Game Detail"] },
]

type SelectFn = (name: string, additive: boolean) => void

function PartsTree({
  selected,
  onSelect,
  onSelectLayer,
}: {
  selected: string[]
  onSelect: SelectFn
  onSelectLayer: (layer: string) => void
}) {
  return (
    <div className="pt-tree">
      <div className="pt-tree-hint">
        Tap to open · use <b>Multi</b> (or ⌘/Ctrl-click) to stack several
      </div>
      {PARTS_TREE.map(group => (
        <div key={group.layer} className="pt-tree-group">
          <button
            type="button"
            className="pt-tree-layer"
            onClick={() => onSelectLayer(group.layer)}
          >
            {group.layer}
            <span className="pt-tree-layer-all">all</span>
          </button>
          {group.items.map(item => {
            const on = selected.includes(item)
            return (
              <button
                key={item}
                type="button"
                className={`pt-tree-item${on ? " is-sel" : ""}`}
                onClick={e =>
                  onSelect(item, e.metaKey || e.ctrlKey || e.shiftKey)
                }
              >
                <span className="pt-tree-check" aria-hidden>
                  {on ? "◉" : "○"}
                </span>
                {item}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

const KNOBS = [
  { id: "base", label: "Text size", min: 12, max: 26, step: 1, unit: "px" },
  {
    id: "ratio",
    label: "Heading scale",
    min: 1.1,
    max: 1.8,
    step: 0.05,
    unit: "",
  },
  { id: "space", label: "Spacing", min: 0.5, max: 2, step: 0.05, unit: "×" },
  { id: "radius", label: "Roundness", min: 0, max: 28, step: 1, unit: "px" },
] as const

/** Live knobs: emit theme variables onto the canvas so every rendered part
 * reflows as you drag. Controlled by the shell so the values are global. */
function Inspector({
  knobs,
  onChange,
  scope,
}: {
  knobs: KnobState
  onChange: (patch: Partial<KnobState>) => void
  scope: string
}) {
  return (
    <div className="pt-inspector">
      <div className="pt-inspector-scope">{scope}</div>
      {KNOBS.map(k => (
        <label key={k.id} className="pt-knob">
          <div className="pt-knob-row">
            <span>{k.label}</span>
            <span className="pt-knob-val">
              {knobs[k.id]}
              {k.unit}
            </span>
          </div>
          <input
            type="range"
            min={k.min}
            max={k.max}
            step={k.step}
            value={knobs[k.id]}
            onChange={e => onChange({ [k.id]: Number(e.target.value) })}
          />
        </label>
      ))}
      <div className="pt-swatches">
        {["#7dd3fc", "#c4b5fd", "#fca5a5", "#86efac", "#fcd34d"].map(c => (
          <button
            key={c}
            type="button"
            className={`pt-swatch${knobs.accent === c ? " is-on" : ""}`}
            style={{ background: c }}
            onClick={() => onChange({ accent: c })}
            aria-label={`Accent ${c}`}
          />
        ))}
      </div>
    </div>
  )
}

const DEVICES = [
  { id: "rg353m", name: "RG353M", on: true, ar: 4 / 3 },
  { id: "thor", name: "THOR", on: true, ar: 16 / 9 },
  { id: "odin2", name: "ODIN 2 PORTAL", on: false, ar: 20 / 9 },
  { id: "tv65", name: '65" 4K TV', on: false, ar: 16 / 9 },
]

function Devices() {
  const [on, setOn] = useState<Record<string, boolean>>(
    Object.fromEntries(DEVICES.map(d => [d.id, d.on])),
  )
  return (
    <div className="pt-devices">
      {DEVICES.map(d => (
        <button
          key={d.id}
          type="button"
          className={`pt-device${on[d.id] ? " is-on" : ""}`}
          onClick={() => setOn(s => ({ ...s, [d.id]: !s[d.id] }))}
        >
          <span className="pt-device-check" aria-hidden>
            {on[d.id] ? "●" : "○"}
          </span>
          {d.name}
        </button>
      ))}
    </div>
  )
}

/** SOURCES catalog — WHERE data comes from. Drag a row onto a canvas object to
 * bind its source axis (independent of state). */
function Sources() {
  return (
    <div className="pt-sources">
      <div className="pt-sources-hint">
        Where data comes from. <b>Drag</b> onto an object or use its <b>◈</b>{" "}
        menu.
      </div>
      {SOURCES.map(s => (
        <div
          key={s.id}
          className="pt-source-row"
          draggable
          onDragStart={e => {
            e.dataTransfer.setData(SOURCE_DND, `source:${s.id}`)
            e.dataTransfer.effectAllowed = "copy"
          }}
        >
          <span className="pt-source-grip" aria-hidden>
            ⠇
          </span>
          <span className={`pt-source-kind is-${s.kind}`}>{s.kind}</span>
          <span className="pt-source-label">{s.label}</span>
        </div>
      ))}
    </div>
  )
}

/** STATES catalog — WHAT the loader is doing (the machine's states). Drag a row
 * onto a canvas object to bind its state axis (independent of source). */
function StatesPanel() {
  return (
    <div className="pt-sources">
      <div className="pt-sources-hint">
        What the loader is doing. <b>Drag</b> onto an object or use its <b>◆</b>{" "}
        menu.
      </div>
      {STATES.map(st => (
        <div
          key={st.id}
          className="pt-source-row"
          draggable
          onDragStart={e => {
            e.dataTransfer.setData(SOURCE_DND, `state:${st.id}`)
            e.dataTransfer.effectAllowed = "copy"
          }}
        >
          <span className="pt-source-grip" aria-hidden>
            ⠇
          </span>
          <span className={`pt-state-dot is-${st.id}`} aria-hidden />
          <span className="pt-source-label">{st.label}</span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Canvas / artboard — representative "real surface" content
// ---------------------------------------------------------------------------

const GAMES = [
  { t: "Hollow Knight", g: "Metroidvania", c: "#6ee7b7" },
  { t: "Hades", g: "Roguelike", c: "#fca5a5" },
  { t: "Celeste", g: "Platformer", c: "#93c5fd" },
  { t: "Stardew Valley", g: "Sim", c: "#fcd34d" },
  { t: "Tunic", g: "Adventure", c: "#c4b5fd" },
]

const ACCENT = GAMES[0].c

type Game = (typeof GAMES)[number]
type SourceStatus = "ready" | "empty" | "loading" | "error"
type SourceData = { status: SourceStatus; games: Game[] }

/** Two independent axes, kept separate on purpose:
 *
 *  SOURCE = WHERE the data comes from (a fixture, or the live korrid layer).
 *  STATE  = WHAT the loader is doing right now (the states a real loading state
 *           machine moves through: loading -> ready / empty / error).
 *
 * A part is handed `dataFor(source, state)`; it never knows which it got. */
type LabSource = {
  id: string
  label: string
  kind: "fixture" | "live"
  badge: string
  games: Game[]
}

const SOURCES: LabSource[] = [
  {
    id: "library",
    label: "Library",
    kind: "fixture",
    badge: "fixture",
    games: GAMES,
  },
  { id: "korrid", label: "korrid", kind: "live", badge: "live", games: GAMES },
]
const SOURCE_BY_ID: Record<string, LabSource> = Object.fromEntries(
  SOURCES.map(s => [s.id, s]),
)
const DEFAULT_SOURCE = "library"

/** The loader states — in the real app these come from a state machine's tags. */
const STATES: { id: SourceStatus; label: string }[] = [
  { id: "ready", label: "Ready" },
  { id: "loading", label: "Loading" },
  { id: "empty", label: "Empty" },
  { id: "error", label: "Error" },
]
const DEFAULT_STATE: SourceStatus = "ready"

const dataFor = (sourceId: string, state: SourceStatus): SourceData => {
  const src = SOURCE_BY_ID[sourceId] ?? SOURCE_BY_ID[DEFAULT_SOURCE]
  if (state === "ready") return { status: "ready", games: src.games }
  return { status: state, games: [] }
}

const SOURCE_DND = "application/x-lab-bind"
const parseBind = (
  raw: string,
): { axis: "source" | "state"; value: string } | null => {
  const [axis, value] = raw.split(":")
  if ((axis === "source" || axis === "state") && value) return { axis, value }
  return null
}

/** A placed canvas object: a part instance bound to one source AND one state.
 * The same part can appear many times, each its own (source, state) pair. */
type ObjInstance = {
  id: string
  part: string
  source: string
  state: SourceStatus
}
let INSTANCE_SEQ = 0
const nextInstanceId = () => `o${(INSTANCE_SEQ += 1)}`

/** Loading / empty / error screen, mirroring the real Shift surface states. */
function SurfaceState({ status }: { status: Exclude<SourceStatus, "ready"> }) {
  const msg =
    status === "loading"
      ? "Loading library…"
      : status === "empty"
        ? "No games found."
        : "Could not load library."
  return (
    <div className="pt-surface pt-surface-state">
      {status === "loading" ? (
        <div className="pt-state-spin" aria-hidden />
      ) : null}
      <div className="pt-state-msg">{msg}</div>
      {status === "error" ? (
        <button className="pt-state-retry" type="button">
          Retry
        </button>
      ) : null}
    </div>
  )
}

/** A labelled column of component states, the way a real workbench shows them. */
function States({ cols }: { cols: { label: string; node: ReactNode }[] }) {
  return (
    <div className="ex-states">
      {cols.map(col => (
        <div key={col.label} className="ex-state">
          <div className="ex-state-cap">{col.label}</div>
          <div className="ex-state-node">{col.node}</div>
        </div>
      ))}
    </div>
  )
}

function HomeSurface({ data }: { data: SourceData }) {
  if (data.status !== "ready") return <SurfaceState status={data.status} />
  const games = data.games
  const hero = games[0]
  return (
    <div className="pt-surface" style={{ ["--accent" as string]: hero.c }}>
      <div className="pt-surface-hero">
        <div className="pt-surface-top">
          <span>4:24 PM</span>
          <span className="pt-surface-status">▮ ▮ ●</span>
        </div>
        <div className="pt-surface-kicker">Continue playing</div>
        <div className="pt-surface-title">{hero.t}</div>
        <div className="pt-surface-chips">
          <span className="pt-chip">{hero.g}</span>
          <span className="pt-chip">Team Cherry</span>
          <span className="pt-chip is-fav">★ Favorite</span>
        </div>
        <div className="pt-surface-actions">
          <span className="pt-cta">▶ Continue</span>
          <span className="pt-cta ghost">Options</span>
        </div>
      </div>
      <div className="pt-rail">
        {games.map((game, i) => (
          <div
            key={game.t}
            className={`pt-tile${i === 0 ? " is-focused" : ""}`}
            style={{ ["--accent" as string]: game.c }}
          >
            <div className="pt-tile-art" />
            <div className="pt-tile-label">{game.t}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DetailSurface({ data }: { data: SourceData }) {
  if (data.status !== "ready") return <SurfaceState status={data.status} />
  const hero = data.games[0]
  return (
    <div
      className="pt-surface pt-surface-detail"
      style={{ ["--accent" as string]: hero.c }}
    >
      <div className="pt-detail-art" />
      <div className="pt-detail-meta">
        <div className="pt-surface-kicker">{hero.g} · 2017</div>
        <div className="pt-surface-title">{hero.t}</div>
        <div className="pt-surface-chips">
          <span className="pt-chip">★ 9.4</span>
          <span className="pt-chip">24h played</span>
          <span className="pt-chip">Team Cherry</span>
        </div>
        <div className="pt-detail-body">
          A vast, ruined kingdom of insects and heroes. Explore twisting
          caverns, ancient cities and deadly wastes below the town of Dirtmouth.
        </div>
        <div className="pt-surface-actions">
          <span className="pt-cta">▶ Continue</span>
          <span className="pt-cta ghost">★ Favorite</span>
        </div>
      </div>
    </div>
  )
}

type PartView = {
  layer: string
  frame: "sm" | "wide" | "wire" | "device"
  note: string
  render: (data: SourceData) => ReactNode
}

const PART_VIEWS: Record<string, PartView> = {
  Pill: {
    layer: "Atom",
    frame: "sm",
    note: "Focusable button surface for header / footer chrome.",
    render: () => (
      <States
        cols={[
          {
            label: "Default",
            node: <button className="ex-pill">Search games</button>,
          },
          {
            label: "Focused",
            node: <button className="ex-pill is-focus">Search games</button>,
          },
          {
            label: "Disabled",
            node: <button className="ex-pill is-disabled">Search games</button>,
          },
        ]}
      />
    ),
  },
  Tile: {
    layer: "Atom",
    frame: "sm",
    note: "The focusable cell inside the home rail.",
    render: () => (
      <States
        cols={[
          { label: "Default", node: <div className="ex-tile" /> },
          { label: "Focused", node: <div className="ex-tile is-focus" /> },
        ]}
      />
    ),
  },
  Chip: {
    layer: "Atom",
    frame: "sm",
    note: "Metadata pill used across hero + detail.",
    render: () => (
      <div className="ex-row">
        <span className="ex-chip">Metroidvania</span>
        <span className="ex-chip">24h played</span>
        <span className="ex-chip is-fav">★ Favorite</span>
      </div>
    ),
  },
  Badge: {
    layer: "Atom",
    frame: "sm",
    note: "Count / status indicator.",
    render: () => (
      <div className="ex-row">
        <span className="ex-badge">3</span>
        <span className="ex-badge is-live">LIVE</span>
        <span className="ex-badge is-new">NEW</span>
      </div>
    ),
  },
  Button: {
    layer: "Atom",
    frame: "sm",
    note: "Primary call-to-action.",
    render: () => (
      <div className="ex-row">
        <span className="ex-cta">▶ Continue</span>
        <span className="ex-cta ghost">Options</span>
      </div>
    ),
  },
  "Search Pill": {
    layer: "Molecule",
    frame: "sm",
    note: "Pill + icon + dismiss — atoms composed into one control.",
    render: () => (
      <div className="ex-searchpill">
        <span aria-hidden>🔍</span>
        <span>Search games</span>
        <span className="ex-searchpill-x" aria-hidden>
          ✕
        </span>
      </div>
    ),
  },
  "Meta Row": {
    layer: "Molecule",
    frame: "sm",
    note: "Genre · developer · last-played, composed from Chips.",
    render: () => (
      <div className="ex-metarow">
        <span className="ex-chip">Metroidvania</span>
        <span className="ex-dot">·</span>
        <span className="ex-chip">Team Cherry</span>
        <span className="ex-dot">·</span>
        <span className="ex-chip">2h ago</span>
      </div>
    ),
  },
  Rating: {
    layer: "Molecule",
    frame: "sm",
    note: "Stars + score.",
    render: () => (
      <div className="ex-rating">
        <span className="ex-stars">★★★★★</span>
        <span className="ex-rating-num">9.4</span>
      </div>
    ),
  },
  "Home Rail": {
    layer: "Organism",
    frame: "wide",
    note: "A scrollable row of Tiles — a self-contained section.",
    render: data =>
      data.status !== "ready" ? (
        <div className="ex-empty">{stateLabel(data.status)}</div>
      ) : (
        <div className="ex-railboard">
          {data.games.map((game, i) => (
            <div
              key={game.t}
              className={`pt-tile${i === 0 ? " is-focused" : ""}`}
              style={{ ["--accent" as string]: game.c }}
            >
              <div className="pt-tile-art" />
              <div className="pt-tile-label">{game.t}</div>
            </div>
          ))}
        </div>
      ),
  },
  "Hero Banner": {
    layer: "Organism",
    frame: "wide",
    note: "Featured hero block: art + title + meta + actions.",
    render: data => {
      if (data.status !== "ready")
        return <div className="ex-empty">{stateLabel(data.status)}</div>
      const hero = data.games[0]
      return (
        <div
          className="ex-heroboard"
          style={{ ["--accent" as string]: hero.c }}
        >
          <div className="pt-surface-kicker">Continue playing</div>
          <div className="pt-surface-title">{hero.t}</div>
          <div className="pt-surface-chips">
            <span className="pt-chip">{hero.g}</span>
            <span className="pt-chip">Team Cherry</span>
            <span className="pt-chip is-fav">★ Favorite</span>
          </div>
          <div className="pt-surface-actions">
            <span className="pt-cta">▶ Continue</span>
            <span className="pt-cta ghost">Options</span>
          </div>
        </div>
      )
    },
  },
  "Home Root": {
    layer: "Template",
    frame: "wire",
    note: "Layout skeleton — regions only, no content yet.",
    render: () => (
      <div className="ex-wire">
        <div className="ex-wire-region r-top">Status bar</div>
        <div className="ex-wire-region r-hero">Hero slot · Hero Banner</div>
        <div className="ex-wire-region r-rail">Rail slot · Home Rail</div>
      </div>
    ),
  },
  "Detail Root": {
    layer: "Template",
    frame: "wire",
    note: "Detail layout skeleton — art column + meta column.",
    render: () => (
      <div className="ex-wire ex-wire-split">
        <div className="ex-wire-region r-art">Art slot</div>
        <div className="ex-wire-col">
          <div className="ex-wire-region r-meta">Meta slot · Meta Row</div>
          <div className="ex-wire-region r-body">Body slot</div>
          <div className="ex-wire-region r-actions">Actions slot · Button</div>
        </div>
      </div>
    ),
  },
  "Cinematic Home": {
    layer: "Page",
    frame: "device",
    note: "The real screen: template filled with live data.",
    render: data => <HomeSurface data={data} />,
  },
  "Game Detail": {
    layer: "Page",
    frame: "device",
    note: "Detail screen with full game metadata.",
    render: data => <DetailSurface data={data} />,
  },
}

function stateLabel(status: Exclude<SourceStatus, "ready">): string {
  return status === "loading"
    ? "Loading…"
    : status === "empty"
      ? "No games"
      : "Load error"
}

function SingleView({
  instance,
  zoom,
  onBind,
  onSplit,
}: {
  instance: ObjInstance | undefined
  zoom: number
  onBind: (id: string, patch: Partial<ObjInstance>) => void
  onSplit: (part: string) => void
}) {
  const part = instance?.part ?? "Cinematic Home"
  const source = instance?.source ?? DEFAULT_SOURCE
  const state = instance?.state ?? DEFAULT_STATE
  const view = PART_VIEWS[part] ?? PART_VIEWS["Cinematic Home"]
  const data = dataFor(source, state)
  const dataDriven = DATA_LAYERS.has(view.layer)
  return (
    <div className="pt-artboard" style={{ transform: `scale(${zoom})` }}>
      {view.frame === "device" ? (
        <div className="pt-frame">{view.render(data)}</div>
      ) : (
        <div className={`pt-board pt-board-${view.frame}`}>
          {view.render(data)}
        </div>
      )}
      <div className="pt-artboard-meta">
        <div className="pt-artboard-label">
          <span className={`pt-layer-tag layer-${view.layer.toLowerCase()}`}>
            {view.layer}
          </span>
          shift · {part}
        </div>
        <div className="pt-artboard-note">{view.note}</div>
        {dataDriven && instance ? (
          <div className="pt-artboard-data">
            <label className="pt-object-source">
              <span className="pt-object-source-icon" aria-hidden>
                ◈
              </span>
              <select
                value={source}
                onChange={e => onBind(instance.id, { source: e.target.value })}
                aria-label={`Data source for ${part}`}
              >
                {SOURCES.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                    {s.kind === "live" ? " · live" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="pt-object-source">
              <span className="pt-object-source-icon pt-icon-state" aria-hidden>
                ◆
              </span>
              <select
                value={state}
                onChange={e =>
                  onBind(instance.id, { state: e.target.value as SourceStatus })
                }
                aria-label={`State for ${part}`}
              >
                {STATES.map(st => (
                  <option key={st.id} value={st.id}>
                    {st.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="pt-split"
              onClick={() => onSplit(part)}
            >
              ⊞ Across all states
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

const ALL_NAMES = PARTS_TREE.flatMap(group => group.items)

const FRAME_SCALE: Record<PartView["frame"], number> = {
  sm: 0.7,
  wide: 0.42,
  wire: 0.5,
  device: 0.36,
}

function GalleryCard({
  name,
  selected,
  onSelect,
}: {
  name: string
  selected: boolean
  onSelect: SelectFn
}) {
  const view = PART_VIEWS[name]
  if (!view) return null
  return (
    <button
      type="button"
      className={`pt-card${selected ? " is-sel" : ""}`}
      onClick={e => onSelect(name, e.metaKey || e.ctrlKey || e.shiftKey)}
    >
      <div className="pt-card-stage">
        <div
          className="pt-card-scale"
          style={{ transform: `scale(${FRAME_SCALE[view.frame]})` }}
        >
          {view.frame === "device" ? (
            <div className="pt-frame">
              {view.render(dataFor(DEFAULT_SOURCE, DEFAULT_STATE))}
            </div>
          ) : (
            view.render(dataFor(DEFAULT_SOURCE, DEFAULT_STATE))
          )}
        </div>
      </div>
      <div className="pt-card-foot">
        <span className={`pt-layer-tag layer-${view.layer.toLowerCase()}`}>
          {view.layer}
        </span>
        <span className="pt-card-name">{name}</span>
      </div>
    </button>
  )
}

function PartGrid({
  names,
  grouped,
  selected,
  onSelect,
}: {
  names: string[]
  grouped: boolean
  selected: string[]
  onSelect: SelectFn
}) {
  if (grouped) {
    return (
      <div className="pt-gallery">
        {PARTS_TREE.map(group => (
          <section key={group.layer} className="pt-gallery-group">
            <header className="pt-gallery-head">
              <span
                className={`pt-layer-tag layer-${group.layer.toLowerCase()}`}
              >
                {group.layer}
              </span>
              <span className="pt-gallery-count">{group.items.length}</span>
            </header>
            <div className="pt-grid">
              {group.items.map(n => (
                <GalleryCard
                  key={n}
                  name={n}
                  selected={selected.includes(n)}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    )
  }
  return (
    <div className="pt-gallery">
      <div className="pt-gallery-head">
        <span className="pt-gallery-count">{names.length} selected</span>
      </div>
      <div className="pt-grid">
        {names.map(n => (
          <GalleryCard key={n} name={n} selected onSelect={onSelect} />
        ))}
      </div>
    </div>
  )
}

const DATA_LAYERS = new Set(["Organism", "Page"])

/** A placed object: a part instance at real size, movable, bound to its own
 * data source (the lattice seam, per object). Accepts a source dropped onto it. */
function DraggablePart({
  instance,
  pos,
  registerRef,
  onStartDrag,
  onBind,
  onDuplicate,
  onSplit,
  onRemove,
}: {
  instance: ObjInstance
  pos: Pos | undefined
  registerRef: (id: string, el: HTMLDivElement | null) => void
  onStartDrag: (id: string, e: React.PointerEvent) => void
  onBind: (id: string, patch: Partial<ObjInstance>) => void
  onDuplicate: (id: string) => void
  onSplit: (part: string) => void
  onRemove: (id: string) => void
}) {
  const [dropActive, setDropActive] = useState(false)
  const view = PART_VIEWS[instance.part]
  if (!view) return null
  const dataDriven = DATA_LAYERS.has(view.layer)
  const data = dataFor(instance.source, instance.state)
  return (
    <div
      ref={el => registerRef(instance.id, el)}
      className={`pt-object${dropActive ? " is-drop" : ""}`}
      style={{
        left: pos?.x ?? 0,
        top: pos?.y ?? 0,
        visibility: pos ? "visible" : "hidden",
      }}
      onDragOver={
        dataDriven
          ? e => {
              if (e.dataTransfer.types.includes(SOURCE_DND)) {
                e.preventDefault()
                setDropActive(true)
              }
            }
          : undefined
      }
      onDragLeave={dataDriven ? () => setDropActive(false) : undefined}
      onDrop={
        dataDriven
          ? e => {
              const bind = parseBind(e.dataTransfer.getData(SOURCE_DND))
              setDropActive(false)
              if (bind) onBind(instance.id, { [bind.axis]: bind.value })
            }
          : undefined
      }
    >
      <div
        className="pt-object-bar"
        onPointerDown={e => onStartDrag(instance.id, e)}
      >
        <span className={`pt-layer-tag layer-${view.layer.toLowerCase()}`}>
          {view.layer}
        </span>
        <span className="pt-object-title">{instance.part}</span>
        {dataDriven ? (
          <label
            className="pt-object-source"
            onPointerDown={e => e.stopPropagation()}
          >
            <span className="pt-object-source-icon" aria-hidden>
              ◈
            </span>
            <select
              value={instance.source}
              onChange={e => onBind(instance.id, { source: e.target.value })}
              aria-label={`Data source for ${instance.part}`}
            >
              {SOURCES.map(s => (
                <option key={s.id} value={s.id}>
                  {s.label}
                  {s.kind === "live" ? " · live" : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {dataDriven ? (
          <label
            className="pt-object-source"
            onPointerDown={e => e.stopPropagation()}
          >
            <span className="pt-object-source-icon pt-icon-state" aria-hidden>
              ◆
            </span>
            <select
              value={instance.state}
              onChange={e =>
                onBind(instance.id, { state: e.target.value as SourceStatus })
              }
              aria-label={`State for ${instance.part}`}
            >
              {STATES.map(st => (
                <option key={st.id} value={st.id}>
                  {st.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {dataDriven ? (
          <button
            type="button"
            className="pt-object-act"
            title="One copy per state"
            onPointerDown={e => e.stopPropagation()}
            onClick={() => onSplit(instance.part)}
            aria-label="Split across all states"
          >
            ⊞
          </button>
        ) : null}
        <button
          type="button"
          className="pt-object-act"
          title="Duplicate"
          onPointerDown={e => e.stopPropagation()}
          onClick={() => onDuplicate(instance.id)}
          aria-label="Duplicate"
        >
          ⧉
        </button>
        <button
          type="button"
          className="pt-object-remove"
          onPointerDown={e => e.stopPropagation()}
          onClick={() => onRemove(instance.id)}
          aria-label="Remove"
        >
          ✕
        </button>
      </div>
      <div className="pt-object-body">
        {view.frame === "device" ? (
          <div className="pt-frame">{view.render(data)}</div>
        ) : (
          <div className={`pt-board pt-board-${view.frame}`}>
            {view.render(data)}
          </div>
        )}
      </div>
    </div>
  )
}

const OBJECT_GAP = 24
const OBJECT_PAD = 28

/** Free canvas: every placed instance at real size, individually movable.
 *
 * Instances are packed left-to-right by their MEASURED size so they never
 * overlap; instances you drag are pinned and left where you put them. */
type Cam = { x: number; y: number; scale: number }
const clampScale = (s: number) => Math.max(0.2, Math.min(3, s))

function CanvasBoard({
  instances,
  onBind,
  onDuplicate,
  onSplit,
  onRemove,
}: {
  instances: ObjInstance[]
  onBind: (id: string, patch: Partial<ObjInstance>) => void
  onDuplicate: (id: string) => void
  onSplit: (part: string) => void
  onRemove: (id: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const nodes = useRef<Map<string, HTMLDivElement>>(new Map())
  const moved = useRef<Set<string>>(new Set())
  const [positions, setPositions] = useState<Record<string, Pos>>({})
  const [cam, setCam] = useState<Cam>({ x: 24, y: 24, scale: 1 })
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({})
  const posRef = useRef(positions)
  posRef.current = positions
  const camRef = useRef(cam)
  camRef.current = cam

  const registerRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) nodes.current.set(id, el)
    else nodes.current.delete(id)
  }, [])

  const sizeOf = (id: string) => {
    const el = nodes.current.get(id)
    return { w: el?.offsetWidth ?? 360, h: el?.offsetHeight ?? 240 }
  }

  // Shelf-pack any instance the user hasn't manually placed, using real sizes.
  useLayoutEffect(() => {
    const container = containerRef.current
    const maxW =
      (container ? container.clientWidth : 1200) / camRef.current.scale
    let x = OBJECT_PAD
    let y = OBJECT_PAD
    let rowH = 0
    const next: Record<string, Pos> = {}
    const ids = new Set(instances.map(o => o.id))
    for (const inst of instances) {
      if (moved.current.has(inst.id) && posRef.current[inst.id]) {
        next[inst.id] = posRef.current[inst.id]
        continue
      }
      const { w, h } = sizeOf(inst.id)
      if (x > OBJECT_PAD && x + w > maxW - OBJECT_PAD) {
        x = OBJECT_PAD
        y += rowH + OBJECT_GAP
        rowH = 0
      }
      next[inst.id] = { x, y }
      x += w + OBJECT_GAP
      rowH = Math.max(rowH, h)
    }
    for (const id of Array.from(moved.current)) {
      if (!ids.has(id)) moved.current.delete(id)
    }
    setPositions(next)
  }, [instances])

  // Wheel-zoom toward the cursor (native, non-passive so preventDefault works).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      setCam(c => {
        const scale = clampScale(c.scale * Math.exp(-e.deltaY * 0.0015))
        const k = scale / c.scale
        return { scale, x: px - (px - c.x) * k, y: py - (py - c.y) * k }
      })
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [])

  // Pan when the drag starts on empty canvas (not on an object).
  const onContainerPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest(".pt-object")) return
    const startX = e.clientX
    const startY = e.clientY
    const base = { ...camRef.current }
    const move = (ev: PointerEvent) => {
      setCam({
        scale: base.scale,
        x: base.x + ev.clientX - startX,
        y: base.y + ev.clientY - startY,
      })
    }
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  const onStartDrag = (id: string, e: React.PointerEvent) => {
    if (e.button !== 0) return
    const startX = e.clientX
    const startY = e.clientY
    const base = posRef.current[id] ?? { x: 0, y: 0 }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    moved.current.add(id)
    const others = instances
      .filter(o => o.id !== id)
      .map(o => posRef.current[o.id])
      .filter((p): p is Pos => !!p)
    const move = (ev: PointerEvent) => {
      const s = camRef.current.scale
      let x = base.x + (ev.clientX - startX) / s
      let y = base.y + (ev.clientY - startY) / s
      const thr = 8 / s
      let gx: number | undefined
      let gy: number | undefined
      for (const p of others) {
        if (Math.abs(x - p.x) < thr) {
          x = p.x
          gx = x
        }
        if (Math.abs(y - p.y) < thr) {
          y = p.y
          gy = y
        }
      }
      setGuides({ x: gx, y: gy })
      setPositions(prev => ({ ...prev, [id]: { x, y } }))
    }
    const up = () => {
      setGuides({})
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  const repackAll = () => {
    moved.current.clear()
    const maxW =
      (containerRef.current?.clientWidth ?? 1200) / camRef.current.scale
    let x = OBJECT_PAD
    let y = OBJECT_PAD
    let rowH = 0
    const next: Record<string, Pos> = {}
    for (const inst of instances) {
      const { w, h } = sizeOf(inst.id)
      if (x > OBJECT_PAD && x + w > maxW - OBJECT_PAD) {
        x = OBJECT_PAD
        y += rowH + OBJECT_GAP
        rowH = 0
      }
      next[inst.id] = { x, y }
      x += w + OBJECT_GAP
      rowH = Math.max(rowH, h)
    }
    setPositions(next)
  }

  const alignEdge = (edge: "left" | "top") => {
    const key = edge === "left" ? "x" : "y"
    const vals = instances
      .map(o => posRef.current[o.id]?.[key])
      .filter((v): v is number => v != null)
    if (!vals.length) return
    const m = Math.min(...vals)
    setPositions(prev => {
      const n = { ...prev }
      for (const o of instances) {
        const p = n[o.id] ?? { x: 0, y: 0 }
        n[o.id] = edge === "left" ? { x: m, y: p.y } : { x: p.x, y: m }
        moved.current.add(o.id)
      }
      return n
    })
  }

  const distributeH = () => {
    const list = instances
      .map(o => ({
        id: o.id,
        x: posRef.current[o.id]?.x ?? 0,
        w: sizeOf(o.id).w,
      }))
      .sort((a, b) => a.x - b.x)
    if (list.length < 3) return
    const minX = list[0].x
    const last = list[list.length - 1]
    const span = last.x + last.w - minX
    const totalW = list.reduce((s, o) => s + o.w, 0)
    const gap = (span - totalW) / (list.length - 1)
    let cx = minX
    setPositions(prev => {
      const n = { ...prev }
      for (const o of list) {
        n[o.id] = { x: cx, y: n[o.id]?.y ?? 0 }
        moved.current.add(o.id)
        cx += o.w + gap
      }
      return n
    })
  }

  const zoomBy = (f: number) => {
    const cont = containerRef.current
    const cx = (cont?.clientWidth ?? 0) / 2
    const cy = (cont?.clientHeight ?? 0) / 2
    setCam(c => {
      const scale = clampScale(c.scale * f)
      const k = scale / c.scale
      return { scale, x: cx - (cx - c.x) * k, y: cy - (cy - c.y) * k }
    })
  }

  const fitView = () => {
    const cont = containerRef.current
    if (!cont || !instances.length) return
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const o of instances) {
      const p = posRef.current[o.id]
      if (!p) continue
      const { w, h } = sizeOf(o.id)
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x + w)
      maxY = Math.max(maxY, p.y + h)
    }
    if (!Number.isFinite(minX)) return
    const pad = 48
    const scale = clampScale(
      Math.min(
        cont.clientWidth / (maxX - minX + pad * 2),
        cont.clientHeight / (maxY - minY + pad * 2),
      ),
    )
    setCam({
      scale,
      x: (cont.clientWidth - (maxX - minX) * scale) / 2 - minX * scale,
      y: (cont.clientHeight - (maxY - minY) * scale) / 2 - minY * scale,
    })
  }

  return (
    <div
      className="pt-board-free"
      ref={containerRef}
      onPointerDown={onContainerPointerDown}
    >
      <div
        className="pt-cam"
        style={{
          transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.scale})`,
          transformOrigin: "0 0",
        }}
      >
        {guides.x != null ? (
          <div className="pt-guide pt-guide-v" style={{ left: guides.x }} />
        ) : null}
        {guides.y != null ? (
          <div className="pt-guide pt-guide-h" style={{ top: guides.y }} />
        ) : null}
        {instances.map(inst => (
          <DraggablePart
            key={inst.id}
            instance={inst}
            pos={positions[inst.id]}
            registerRef={registerRef}
            onStartDrag={onStartDrag}
            onBind={onBind}
            onDuplicate={onDuplicate}
            onSplit={onSplit}
            onRemove={onRemove}
          />
        ))}
      </div>
      <div className="pt-board-tools">
        <button type="button" onClick={() => zoomBy(1 / 1.2)} title="Zoom out">
          −
        </button>
        <span className="pt-board-zoom">{Math.round(cam.scale * 100)}%</span>
        <button type="button" onClick={() => zoomBy(1.2)} title="Zoom in">
          +
        </button>
        <button type="button" onClick={fitView} title="Fit all">
          Fit
        </button>
        <button
          type="button"
          onClick={() => setCam({ x: 24, y: 24, scale: 1 })}
          title="Reset zoom"
        >
          100%
        </button>
        <span className="pt-board-tools-sep" />
        <button
          type="button"
          onClick={() => alignEdge("left")}
          title="Align left"
        >
          ├
        </button>
        <button
          type="button"
          onClick={() => alignEdge("top")}
          title="Align top"
        >
          ┬
        </button>
        <button
          type="button"
          onClick={distributeH}
          title="Distribute horizontally"
        >
          ☰
        </button>
        <button type="button" onClick={repackAll} title="Re-tidy">
          Tidy
        </button>
      </div>
    </div>
  )
}

/** One matrix cell: a scaled render of a part under a (source, state, device). */
function MatrixCell({
  part,
  source,
  state,
  ar,
}: {
  part: string
  source: string
  state: SourceStatus
  ar?: number
}) {
  const view = PART_VIEWS[part]
  if (!view) return <div className="pt-matrix-cell" />
  const data = dataFor(source, state)
  return (
    <div className="pt-matrix-cell">
      <div
        className="pt-matrix-stage"
        style={ar ? { aspectRatio: String(ar) } : undefined}
      >
        <div
          className="pt-card-scale"
          style={{ transform: `scale(${FRAME_SCALE[view.frame]})` }}
        >
          {view.frame === "device" ? (
            <div className="pt-frame">{view.render(data)}</div>
          ) : (
            view.render(data)
          )}
        </div>
      </div>
    </div>
  )
}

type AxisKind = "part" | "source" | "state" | "device"
const AXES: { id: AxisKind; label: string }[] = [
  { id: "part", label: "Parts" },
  { id: "source", label: "Sources" },
  { id: "state", label: "States" },
  { id: "device", label: "Devices" },
]
type AxisVal = { id: string; label: string; ar?: number }
function axisValues(kind: AxisKind, parts: string[]): AxisVal[] {
  if (kind === "part")
    return (parts.length ? parts : ["Cinematic Home"]).map(p => ({
      id: p,
      label: p,
    }))
  if (kind === "source") return SOURCES.map(s => ({ id: s.id, label: s.label }))
  if (kind === "state") return STATES.map(s => ({ id: s.id, label: s.label }))
  return DEVICES.map(d => ({ id: d.id, label: d.name, ar: d.ar }))
}

/** Parametric axis grid: pick any two of Parts / Sources / States / Devices and
 * every cell renders that intersection — the honest source × state matrix. */
function MatrixView({ parts }: { parts: string[] }) {
  const [rowAxis, setRowAxis] = useState<AxisKind>("part")
  const [colAxis, setColAxis] = useState<AxisKind>("state")
  const rows = axisValues(rowAxis, parts)
  const cols = axisValues(colAxis, parts)
  const basePart = parts[0] ?? "Cinematic Home"

  const cellOf = (rv: AxisVal, cv: AxisVal) => {
    const cfg = {
      part: basePart,
      source: DEFAULT_SOURCE,
      state: DEFAULT_STATE,
      ar: undefined as number | undefined,
    }
    const apply = (kind: AxisKind, v: AxisVal) => {
      if (kind === "part") cfg.part = v.id
      else if (kind === "source") cfg.source = v.id
      else if (kind === "state") cfg.state = v.id as SourceStatus
      else cfg.ar = v.ar
    }
    apply(rowAxis, rv)
    apply(colAxis, cv)
    return cfg
  }

  return (
    <div className="pt-matrix-wrap">
      <div className="pt-matrix-axisbar">
        <label className="pt-matrix-axispick">
          Rows
          <select
            value={rowAxis}
            onChange={e => setRowAxis(e.target.value as AxisKind)}
          >
            {AXES.map(a => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <span className="pt-matrix-axissep" />
        <label className="pt-matrix-axispick">
          Columns
          <select
            value={colAxis}
            onChange={e => setColAxis(e.target.value as AxisKind)}
          >
            {AXES.map(a => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="pt-matrix-scroll">
        <div
          className="pt-matrix"
          style={{
            gridTemplateColumns: `150px repeat(${cols.length}, minmax(180px, 1fr))`,
          }}
        >
          <div className="pt-matrix-corner" />
          {cols.map(c => (
            <div key={c.id} className="pt-matrix-colhead">
              {c.label}
            </div>
          ))}
          {rows.map(rv => {
            const rowView = rowAxis === "part" ? PART_VIEWS[rv.id] : undefined
            return (
              <Fragment key={rv.id}>
                <div className="pt-matrix-rowhead">
                  {rowView ? (
                    <span
                      className={`pt-layer-tag layer-${rowView.layer.toLowerCase()}`}
                    >
                      {rowView.layer}
                    </span>
                  ) : null}
                  <span className="pt-matrix-rowname">{rv.label}</span>
                </div>
                {cols.map(cv => {
                  const cfg = cellOf(rv, cv)
                  return (
                    <MatrixCell
                      key={cv.id}
                      part={cfg.part}
                      source={cfg.source}
                      state={cfg.state}
                      ar={cfg.ar}
                    />
                  )
                })}
              </Fragment>
            )
          })}
        </div>
      </div>
    </div>
  )
}

type CanvasView = "selection" | "matrix" | "gallery"

function CanvasContent({
  selected,
  instances,
  view,
  zoom,
  onSelect,
  onBind,
  onDuplicate,
  onSplit,
  onRemove,
}: {
  selected: string[]
  instances: ObjInstance[]
  view: CanvasView
  zoom: number
  onSelect: SelectFn
  onBind: (id: string, patch: Partial<ObjInstance>) => void
  onDuplicate: (id: string) => void
  onSplit: (part: string) => void
  onRemove: (id: string) => void
}) {
  if (view === "gallery")
    return (
      <PartGrid
        names={ALL_NAMES}
        grouped
        selected={selected}
        onSelect={onSelect}
      />
    )
  if (view === "matrix") return <MatrixView parts={selected} />
  if (instances.length > 1)
    return (
      <CanvasBoard
        instances={instances}
        onBind={onBind}
        onDuplicate={onDuplicate}
        onSplit={onSplit}
        onRemove={onRemove}
      />
    )
  return (
    <SingleView
      instance={instances[0]}
      zoom={zoom}
      onBind={onBind}
      onSplit={onSplit}
    />
  )
}

// ---------------------------------------------------------------------------
// Chrome: tool rail + top bar
// ---------------------------------------------------------------------------

const TOOLS = ["✛", "⤡", "🔍", "📐", "⌗", "✎"]

function ToolRail({ docked }: { docked: boolean }) {
  const [active, setActive] = useState(0)
  return (
    <div className={`pt-toolrail${docked ? " is-docked" : ""}`}>
      {TOOLS.map((tool, i) => (
        <button
          key={tool}
          type="button"
          className={`pt-tool${active === i ? " is-on" : ""}`}
          onClick={() => setActive(i)}
        >
          {tool}
        </button>
      ))}
    </div>
  )
}

function TopBar({
  variant,
  onVariant,
  onToggleChrome,
  compact,
}: {
  variant: Variant
  onVariant: (v: Variant) => void
  onToggleChrome: () => void
  compact: boolean
}) {
  return (
    <header className="pt-topbar">
      <div className="pt-brand">
        <span className="pt-brand-dot" />
        Korri Lab
        <span className="pt-brand-sub">prototype</span>
      </div>

      {compact ? null : (
        <div className="pt-seg" role="tablist" aria-label="Layout direction">
          {(["dock", "float", "focus"] as Variant[]).map(v => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={variant === v}
              className={`pt-seg-btn${variant === v ? " is-on" : ""}`}
              onClick={() => onVariant(v)}
            >
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      )}

      <div className="pt-topbar-right">
        <label className="pt-surface-select">
          Surface
          <select defaultValue="shift">
            <option value="shift">shift</option>
            <option value="pico">pico</option>
            <option value="boxbuster">boxbuster</option>
          </select>
        </label>
        <button type="button" className="pt-eye" onClick={onToggleChrome}>
          Hide UI
        </button>
      </div>
    </header>
  )
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches,
  )
  useEffect(() => {
    if (typeof window === "undefined") return
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    onChange()
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [query])
  return matches
}

/** Touch layout: one bottom drawer with tabbed panels instead of floaters. */
function TouchSheet({
  selected,
  onSelect,
  onSelectLayer,
  knobs,
  onKnob,
}: {
  selected: string[]
  onSelect: SelectFn
  onSelectLayer: (layer: string) => void
  knobs: KnobState
  onKnob: (patch: Partial<KnobState>) => void
}) {
  const [tab, setTab] = useState<
    "parts" | "sources" | "states" | "inspector" | "devices"
  >("parts")
  const [expanded, setExpanded] = useState(true)
  const tabs: { id: typeof tab; label: string }[] = [
    { id: "parts", label: "Parts" },
    { id: "sources", label: "Sources" },
    { id: "states", label: "States" },
    { id: "inspector", label: "Inspector" },
    { id: "devices", label: "Devices" },
  ]
  return (
    <div className={`pt-sheet${expanded ? " is-expanded" : ""}`}>
      <button
        type="button"
        className="pt-sheet-grab"
        onClick={() => setExpanded(e => !e)}
        aria-label={expanded ? "Collapse panel" : "Expand panel"}
      >
        <span />
      </button>
      <div className="pt-sheet-tabs" role="tablist" aria-label="Panels">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`pt-sheet-tab${tab === t.id ? " is-on" : ""}`}
            onClick={() => {
              setTab(t.id)
              setExpanded(true)
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="pt-sheet-body">
        {tab === "parts" ? (
          <PartsTree
            selected={selected}
            onSelect={onSelect}
            onSelectLayer={onSelectLayer}
          />
        ) : null}
        {tab === "sources" ? <Sources /> : null}
        {tab === "states" ? <StatesPanel /> : null}
        {tab === "inspector" ? (
          <Inspector knobs={knobs} onChange={onKnob} scope="Whole canvas" />
        ) : null}
        {tab === "devices" ? <Devices /> : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export function ShellPrototype() {
  const [variant, setVariant] = useState<Variant>("dock")
  const [chrome, setChrome] = useState(true)
  const [selected, setSelected] = useState<string[]>(["Pill"])
  const [instances, setInstances] = useState<ObjInstance[]>(() => [
    {
      id: nextInstanceId(),
      part: "Pill",
      source: DEFAULT_SOURCE,
      state: DEFAULT_STATE,
    },
  ])
  const [view, setView] = useState<CanvasView>("selection")
  const [multi, setMulti] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [knobs, setKnobs] = useState<KnobState>(DEFAULT_KNOBS)
  const compact = useMediaQuery("(max-width: 760px)")

  const patchKnobs = useCallback(
    (patch: Partial<KnobState>) => setKnobs(k => ({ ...k, ...patch })),
    [],
  )

  const instancesRef = useRef(instances)
  instancesRef.current = instances

  // Reconcile canvas instances with the tree selection: every selected part has
  // at least one instance; deselected parts drop all of theirs. Extra instances
  // created by duplicate / split persist because their part stays selected.
  useEffect(() => {
    setInstances(prev => {
      const kept = prev.filter(o => selected.includes(o.part))
      const result = [...kept]
      for (const name of selected) {
        if (!result.some(o => o.part === name)) {
          result.push({
            id: nextInstanceId(),
            part: name,
            source: DEFAULT_SOURCE,
            state: DEFAULT_STATE,
          })
        }
      }
      return result
    })
  }, [selected])

  const handleSelect = useCallback<SelectFn>(
    (name, additive) => {
      const add = additive || multi
      setView("selection")
      setSelected(prev => {
        if (!add) return [name]
        return prev.includes(name)
          ? prev.filter(n => n !== name)
          : [...prev, name]
      })
    },
    [multi],
  )

  const handleSelectLayer = useCallback((layer: string) => {
    const group = PARTS_TREE.find(g => g.layer === layer)
    if (!group) return
    setView("selection")
    setSelected(group.items)
  }, [])

  const bindInstance = useCallback(
    (id: string, patch: Partial<ObjInstance>) => {
      setInstances(prev =>
        prev.map(o => (o.id === id ? { ...o, ...patch } : o)),
      )
    },
    [],
  )

  const duplicateInstance = useCallback((id: string) => {
    const list = instancesRef.current
    const idx = list.findIndex(o => o.id === id)
    if (idx < 0) return
    const copy: ObjInstance = {
      id: nextInstanceId(),
      part: list[idx].part,
      source: list[idx].source,
      state: list[idx].state,
    }
    const next = [...list]
    next.splice(idx + 1, 0, copy)
    setInstances(next)
  }, [])

  // Fan one part out across every loader STATE (ready/loading/empty/error).
  const splitAcrossStates = useCallback((part: string) => {
    const others = instancesRef.current.filter(o => o.part !== part)
    const spread = STATES.map(st => ({
      id: nextInstanceId(),
      part,
      source: DEFAULT_SOURCE,
      state: st.id,
    }))
    setInstances([...others, ...spread])
  }, [])

  const removeInstance = useCallback((id: string) => {
    const inst = instancesRef.current.find(o => o.id === id)
    if (!inst) return
    const rest = instancesRef.current.filter(o => o.id !== id)
    setInstances(rest)
    // Removing the last instance of a part also clears it from the tree.
    if (!rest.some(o => o.part === inst.part)) {
      setSelected(prev => prev.filter(n => n !== inst.part))
    }
  }, [])

  const clearAll = useCallback(() => {
    setSelected([])
    setInstances([])
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        e.preventDefault()
        setChrome(c => !c)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const w = typeof window === "undefined" ? 1440 : window.innerWidth
  const showZoom = view === "selection" && instances.length <= 1 && !compact

  return (
    <div
      className={`pt-shell pt-${variant}${compact ? " pt-compact" : ""}`}
      data-chrome={chrome ? "on" : "off"}
    >
      <div
        className="pt-canvas"
        style={{
          ["--k-base" as string]: `${knobs.base}px`,
          ["--k-ratio" as string]: `${knobs.ratio}`,
          ["--k-space" as string]: `${knobs.space}`,
          ["--k-radius" as string]: `${knobs.radius}px`,
          ["--k-accent" as string]: knobs.accent,
        }}
      >
        <div className="pt-canvas-bar">
          <div
            className="pt-seg pt-seg-sm"
            role="tablist"
            aria-label="Canvas view"
          >
            <button
              type="button"
              role="tab"
              aria-selected={view === "selection"}
              className={`pt-seg-btn${view === "selection" ? " is-on" : ""}`}
              onClick={() => setView("selection")}
            >
              Selection
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "matrix"}
              className={`pt-seg-btn${view === "matrix" ? " is-on" : ""}`}
              onClick={() => setView("matrix")}
            >
              Matrix
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "gallery"}
              className={`pt-seg-btn${view === "gallery" ? " is-on" : ""}`}
              onClick={() => setView("gallery")}
            >
              Gallery
            </button>
          </div>
          <button
            type="button"
            className={`pt-multi${multi ? " is-on" : ""}`}
            aria-pressed={multi}
            onClick={() => setMulti(m => !m)}
          >
            {multi ? "◉" : "○"} Multi
          </button>
          {instances.length > 0 ? (
            <>
              <span className="pt-canvas-count">
                {instances.length} object{instances.length === 1 ? "" : "s"}
              </span>
              <button
                type="button"
                className="pt-canvas-clear"
                onClick={clearAll}
              >
                Clear
              </button>
            </>
          ) : null}
        </div>
        <CanvasContent
          selected={selected}
          instances={instances}
          view={view}
          zoom={zoom}
          onSelect={handleSelect}
          onBind={bindInstance}
          onDuplicate={duplicateInstance}
          onSplit={splitAcrossStates}
          onRemove={removeInstance}
        />
        {showZoom ? (
          <div className="pt-zoombar">
            <button
              type="button"
              onClick={() => setZoom(z => Math.max(0.4, z - 0.1))}
            >
              –
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoom(z => Math.min(2, z + 0.1))}
            >
              +
            </button>
          </div>
        ) : null}
      </div>

      {chrome ? (
        <>
          <TopBar
            variant={variant}
            onVariant={setVariant}
            onToggleChrome={() => setChrome(false)}
            compact={compact}
          />

          {compact ? (
            <TouchSheet
              selected={selected}
              onSelect={handleSelect}
              onSelectLayer={handleSelectLayer}
              knobs={knobs}
              onKnob={patchKnobs}
            />
          ) : null}

          {!compact && variant === "dock" ? (
            <>
              <ToolRail docked />
              <aside className="pt-dock-right">
                <FloatingPanel
                  title="Parts"
                  initial={{ x: w - 264, y: 64 }}
                  width={248}
                  accent="#7dd3fc"
                >
                  <PartsTree
                    selected={selected}
                    onSelect={handleSelect}
                    onSelectLayer={handleSelectLayer}
                  />
                </FloatingPanel>
                <FloatingPanel
                  title="Inspector"
                  initial={{ x: w - 264, y: 470 }}
                  width={248}
                  accent="#c4b5fd"
                >
                  <Inspector
                    knobs={knobs}
                    onChange={patchKnobs}
                    scope="Whole canvas"
                  />
                </FloatingPanel>
                <FloatingPanel
                  title="Sources"
                  initial={{ x: w - 532, y: 64 }}
                  width={248}
                  accent="#f0abfc"
                >
                  <Sources />
                </FloatingPanel>
                <FloatingPanel
                  title="States"
                  initial={{ x: w - 532, y: 252 }}
                  width={248}
                  accent="#86efac"
                >
                  <StatesPanel />
                </FloatingPanel>
                <FloatingPanel
                  title="Devices"
                  initial={{ x: w - 532, y: 470 }}
                  width={248}
                  accent="#fcd34d"
                >
                  <Devices />
                </FloatingPanel>
              </aside>
            </>
          ) : null}

          {!compact && variant === "float" ? (
            <>
              <ToolRail docked={false} />
              <FloatingPanel
                title="Parts"
                initial={{ x: 96, y: 120 }}
                width={236}
                accent="#7dd3fc"
              >
                <PartsTree
                  selected={selected}
                  onSelect={handleSelect}
                  onSelectLayer={handleSelectLayer}
                />
              </FloatingPanel>
              <FloatingPanel
                title="Inspector"
                initial={{ x: w - 300, y: 110 }}
                width={252}
                accent="#c4b5fd"
              >
                <Inspector
                  knobs={knobs}
                  onChange={patchKnobs}
                  scope="Whole canvas"
                />
              </FloatingPanel>
              <FloatingPanel
                title="Sources"
                initial={{ x: 96, y: 430 }}
                width={236}
                accent="#f0abfc"
              >
                <Sources />
              </FloatingPanel>
              <FloatingPanel
                title="States"
                initial={{ x: 348, y: 430 }}
                width={236}
                accent="#86efac"
              >
                <StatesPanel />
              </FloatingPanel>
              <FloatingPanel
                title="Devices"
                initial={{ x: w - 300, y: 430 }}
                width={252}
                accent="#fcd34d"
              >
                <Devices />
              </FloatingPanel>
            </>
          ) : null}

          {!compact && variant === "focus" ? (
            <FocusRail
              selected={selected}
              onSelect={handleSelect}
              onSelectLayer={handleSelectLayer}
              knobs={knobs}
              onKnob={patchKnobs}
            />
          ) : null}
        </>
      ) : (
        <button
          type="button"
          className="pt-show"
          onClick={() => setChrome(true)}
        >
          Show UI
        </button>
      )}
    </div>
  )
}

function FocusRail({
  selected,
  onSelect,
  onSelectLayer,
  knobs,
  onKnob,
}: {
  selected: string[]
  onSelect: SelectFn
  onSelectLayer: (layer: string) => void
  knobs: KnobState
  onKnob: (patch: Partial<KnobState>) => void
}) {
  const [open, setOpen] = useState<
    null | "parts" | "sources" | "states" | "inspector"
  >(null)
  return (
    <>
      {open === "parts" ? (
        <FloatingPanel
          title="Parts"
          initial={{ x: 24, y: 96 }}
          width={240}
          accent="#7dd3fc"
        >
          <PartsTree
            selected={selected}
            onSelect={onSelect}
            onSelectLayer={onSelectLayer}
          />
        </FloatingPanel>
      ) : null}
      {open === "sources" ? (
        <FloatingPanel
          title="Sources"
          initial={{ x: 24, y: 96 }}
          width={250}
          accent="#f0abfc"
        >
          <Sources />
        </FloatingPanel>
      ) : null}
      {open === "states" ? (
        <FloatingPanel
          title="States"
          initial={{ x: 24, y: 96 }}
          width={250}
          accent="#86efac"
        >
          <StatesPanel />
        </FloatingPanel>
      ) : null}
      {open === "inspector" ? (
        <FloatingPanel
          title="Inspector"
          initial={{
            x: typeof window === "undefined" ? 1100 : window.innerWidth - 288,
            y: 96,
          }}
          width={264}
          accent="#c4b5fd"
        >
          <Inspector knobs={knobs} onChange={onKnob} scope="Whole canvas" />
        </FloatingPanel>
      ) : null}
      <nav className="pt-command">
        <button
          type="button"
          className={open === "parts" ? "is-on" : ""}
          onClick={() => setOpen(o => (o === "parts" ? null : "parts"))}
        >
          Parts
        </button>
        <button
          type="button"
          className={open === "sources" ? "is-on" : ""}
          onClick={() => setOpen(o => (o === "sources" ? null : "sources"))}
        >
          Sources
        </button>
        <button
          type="button"
          className={open === "states" ? "is-on" : ""}
          onClick={() => setOpen(o => (o === "states" ? null : "states"))}
        >
          States
        </button>
        <button
          type="button"
          className={open === "inspector" ? "is-on" : ""}
          onClick={() => setOpen(o => (o === "inspector" ? null : "inspector"))}
        >
          Inspector
        </button>
        <span className="pt-command-sep" />
        <code>shift · Cinematic Home</code>
        <span className="pt-command-sep" />
        <button type="button">Copy link</button>
      </nav>
    </>
  )
}
