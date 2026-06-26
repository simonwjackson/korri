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
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"

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
      const x = Math.max(0, Math.min(window.innerWidth - 60, base.x + ev.clientX - startX))
      const y = Math.max(0, Math.min(window.innerHeight - 30, base.y + ev.clientY - startY))
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
                onClick={e => onSelect(item, e.metaKey || e.ctrlKey || e.shiftKey)}
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
  { id: "base", label: "Base size", min: 0.5, max: 6, step: 0.1, value: 2.4, unit: "cqi" },
  { id: "ratio", label: "Type ratio", min: 1.1, max: 1.6, step: 0.01, value: 1.25, unit: "" },
  { id: "space", label: "Spacing", min: 0.2, max: 1.2, step: 0.05, value: 0.5, unit: "em" },
  { id: "radius", label: "Radius", min: 0, max: 24, step: 1, value: 10, unit: "px" },
]

function Inspector() {
  const [vals, setVals] = useState<Record<string, number>>(
    Object.fromEntries(KNOBS.map(k => [k.id, k.value])),
  )
  return (
    <div className="pt-inspector">
      {KNOBS.map(k => (
        <label key={k.id} className="pt-knob">
          <div className="pt-knob-row">
            <span>{k.label}</span>
            <span className="pt-knob-val">
              {vals[k.id]}
              {k.unit}
            </span>
          </div>
          <input
            type="range"
            min={k.min}
            max={k.max}
            step={k.step}
            value={vals[k.id]}
            onChange={e => setVals(v => ({ ...v, [k.id]: Number(e.target.value) }))}
          />
        </label>
      ))}
      <div className="pt-swatches">
        {["#7dd3fc", "#c4b5fd", "#fca5a5", "#86efac", "#fcd34d"].map(c => (
          <span key={c} className="pt-swatch" style={{ background: c }} />
        ))}
      </div>
    </div>
  )
}

const DEVICES = [
  { id: "rg353m", name: "RG353M", on: true },
  { id: "thor", name: "THOR", on: true },
  { id: "odin2", name: "ODIN 2 PORTAL", on: false },
  { id: "tv65", name: '65" 4K TV', on: false },
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

function HomeSurface() {
  return (
    <div className="pt-surface" style={{ ["--accent" as string]: ACCENT }}>
      <div className="pt-surface-hero">
        <div className="pt-surface-top">
          <span>4:24 PM</span>
          <span className="pt-surface-status">▮ ▮ ●</span>
        </div>
        <div className="pt-surface-kicker">Continue playing</div>
        <div className="pt-surface-title">{GAMES[0].t}</div>
        <div className="pt-surface-chips">
          <span className="pt-chip">{GAMES[0].g}</span>
          <span className="pt-chip">Team Cherry</span>
          <span className="pt-chip is-fav">★ Favorite</span>
        </div>
        <div className="pt-surface-actions">
          <span className="pt-cta">▶ Continue</span>
          <span className="pt-cta ghost">Options</span>
        </div>
      </div>
      <div className="pt-rail">
        {GAMES.map((game, i) => (
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

function DetailSurface() {
  return (
    <div className="pt-surface pt-surface-detail" style={{ ["--accent" as string]: ACCENT }}>
      <div className="pt-detail-art" />
      <div className="pt-detail-meta">
        <div className="pt-surface-kicker">Adventure · 2017</div>
        <div className="pt-surface-title">{GAMES[0].t}</div>
        <div className="pt-surface-chips">
          <span className="pt-chip">★ 9.4</span>
          <span className="pt-chip">24h played</span>
          <span className="pt-chip">Team Cherry</span>
        </div>
        <div className="pt-detail-body">
          A vast, ruined kingdom of insects and heroes. Explore twisting caverns,
          ancient cities and deadly wastes below the town of Dirtmouth.
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
  render: () => ReactNode
}

const PART_VIEWS: Record<string, PartView> = {
  Pill: {
    layer: "Atom",
    frame: "sm",
    note: "Focusable button surface for header / footer chrome.",
    render: () => (
      <States
        cols={[
          { label: "Default", node: <button className="ex-pill">Search games</button> },
          { label: "Focused", node: <button className="ex-pill is-focus">Search games</button> },
          { label: "Disabled", node: <button className="ex-pill is-disabled">Search games</button> },
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
        <span className="ex-searchpill-x" aria-hidden>✕</span>
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
    render: () => (
      <div className="ex-railboard">
        {GAMES.map((game, i) => (
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
    render: () => (
      <div className="ex-heroboard" style={{ ["--accent" as string]: ACCENT }}>
        <div className="pt-surface-kicker">Continue playing</div>
        <div className="pt-surface-title">{GAMES[0].t}</div>
        <div className="pt-surface-chips">
          <span className="pt-chip">{GAMES[0].g}</span>
          <span className="pt-chip">Team Cherry</span>
          <span className="pt-chip is-fav">★ Favorite</span>
        </div>
        <div className="pt-surface-actions">
          <span className="pt-cta">▶ Continue</span>
          <span className="pt-cta ghost">Options</span>
        </div>
      </div>
    ),
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
    render: () => <HomeSurface />,
  },
  "Game Detail": {
    layer: "Page",
    frame: "device",
    note: "Detail screen with full game metadata.",
    render: () => <DetailSurface />,
  },
}

function PartCanvas({ selected, zoom }: { selected: string; zoom: number }) {
  const view = PART_VIEWS[selected] ?? PART_VIEWS["Cinematic Home"]
  return (
    <div className="pt-artboard" style={{ transform: `scale(${zoom})` }}>
      {view.frame === "device" ? (
        <div className="pt-frame">{view.render()}</div>
      ) : (
        <div className={`pt-board pt-board-${view.frame}`}>{view.render()}</div>
      )}
      <div className="pt-artboard-meta">
        <div className="pt-artboard-label">
          <span className={`pt-layer-tag layer-${view.layer.toLowerCase()}`}>
            {view.layer}
          </span>
          shift · {selected}
        </div>
        <div className="pt-artboard-note">{view.note}</div>
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
            <div className="pt-frame">{view.render()}</div>
          ) : (
            view.render()
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
          <GalleryCard
            key={n}
            name={n}
            selected
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  )
}

/** One selected part as a real-size, draggable object on the canvas. */
function DraggablePart({
  name,
  index,
  onRemove,
}: {
  name: string
  index: number
  onRemove: (name: string) => void
}) {
  const initial = {
    x: 32 + (index % 3) * 340,
    y: 56 + Math.floor(index / 3) * 300,
  }
  const { pos, onPointerDown } = useDraggable(initial)
  const view = PART_VIEWS[name]
  if (!view) return null
  return (
    <div className="pt-object" style={{ left: pos.x, top: pos.y }}>
      <div className="pt-object-bar" onPointerDown={onPointerDown}>
        <span className={`pt-layer-tag layer-${view.layer.toLowerCase()}`}>
          {view.layer}
        </span>
        <span className="pt-object-title">{name}</span>
        <button
          type="button"
          className="pt-object-remove"
          onPointerDown={e => e.stopPropagation()}
          onClick={() => onRemove(name)}
          aria-label={`Remove ${name}`}
        >
          ✕
        </button>
      </div>
      <div className="pt-object-body">
        {view.frame === "device" ? (
          <div className="pt-frame">{view.render()}</div>
        ) : (
          <div className={`pt-board pt-board-${view.frame}`}>{view.render()}</div>
        )}
      </div>
    </div>
  )
}

/** Free canvas: every selected part at real size, individually movable. */
function CanvasBoard({
  selected,
  onRemove,
}: {
  selected: string[]
  onRemove: (name: string) => void
}) {
  return (
    <div className="pt-board-free">
      {selected.map((name, i) => (
        <DraggablePart key={name} name={name} index={i} onRemove={onRemove} />
      ))}
    </div>
  )
}

type CanvasView = "selection" | "gallery"

function CanvasContent({
  selected,
  view,
  zoom,
  onSelect,
  onRemove,
}: {
  selected: string[]
  view: CanvasView
  zoom: number
  onSelect: SelectFn
  onRemove: (name: string) => void
}) {
  if (view === "gallery")
    return (
      <PartGrid names={ALL_NAMES} grouped selected={selected} onSelect={onSelect} />
    )
  if (selected.length > 1)
    return <CanvasBoard selected={selected} onRemove={onRemove} />
  return <PartCanvas selected={selected[0] ?? "Cinematic Home"} zoom={zoom} />
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
}: {
  selected: string[]
  onSelect: SelectFn
  onSelectLayer: (layer: string) => void
}) {
  const [tab, setTab] = useState<"parts" | "inspector" | "devices">("parts")
  const [expanded, setExpanded] = useState(true)
  const tabs: { id: typeof tab; label: string }[] = [
    { id: "parts", label: "Parts" },
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
        {tab === "inspector" ? <Inspector /> : null}
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
  const [view, setView] = useState<CanvasView>("selection")
  const [multi, setMulti] = useState(false)
  const [zoom, setZoom] = useState(1)
  const compact = useMediaQuery("(max-width: 760px)")

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

  const handleRemove = useCallback((name: string) => {
    setSelected(prev => prev.filter(n => n !== name))
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
  const showZoom = view === "selection" && selected.length <= 1 && !compact

  return (
    <div
      className={`pt-shell pt-${variant}${compact ? " pt-compact" : ""}`}
      data-chrome={chrome ? "on" : "off"}
    >
      <div className="pt-canvas">
        <div className="pt-canvas-bar">
          <div className="pt-seg pt-seg-sm" role="tablist" aria-label="Canvas view">
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
          {selected.length > 0 ? (
            <>
              <span className="pt-canvas-count">{selected.length} selected</span>
              <button
                type="button"
                className="pt-canvas-clear"
                onClick={() => setSelected([])}
              >
                Clear
              </button>
            </>
          ) : null}
        </div>
        <CanvasContent
          selected={selected}
          view={view}
          zoom={zoom}
          onSelect={handleSelect}
          onRemove={handleRemove}
        />
        {showZoom ? (
          <div className="pt-zoombar">
            <button type="button" onClick={() => setZoom(z => Math.max(0.4, z - 0.1))}>–</button>
            <span>{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom(z => Math.min(2, z + 0.1))}>+</button>
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
            />
          ) : null}

          {!compact && variant === "dock" ? (
            <>
              <ToolRail docked />
              <aside className="pt-dock-right">
                <FloatingPanel title="Parts" initial={{ x: w - 264, y: 64 }} width={248} accent="#7dd3fc">
                  <PartsTree
                    selected={selected}
                    onSelect={handleSelect}
                    onSelectLayer={handleSelectLayer}
                  />
                </FloatingPanel>
                <FloatingPanel title="Inspector" initial={{ x: w - 264, y: 384 }} width={248} accent="#c4b5fd">
                  <Inspector />
                </FloatingPanel>
                <FloatingPanel title="Devices" initial={{ x: w - 264, y: 612 }} width={248} accent="#86efac">
                  <Devices />
                </FloatingPanel>
              </aside>
            </>
          ) : null}

          {!compact && variant === "float" ? (
            <>
              <ToolRail docked={false} />
              <FloatingPanel title="Parts" initial={{ x: 96, y: 120 }} width={236} accent="#7dd3fc">
                <PartsTree
                  selected={selected}
                  onSelect={handleSelect}
                  onSelectLayer={handleSelectLayer}
                />
              </FloatingPanel>
              <FloatingPanel title="Inspector" initial={{ x: w - 300, y: 110 }} width={252} accent="#c4b5fd">
                <Inspector />
              </FloatingPanel>
              <FloatingPanel title="Devices" initial={{ x: w - 300, y: 430 }} width={252} accent="#86efac">
                <Devices />
              </FloatingPanel>
            </>
          ) : null}

          {!compact && variant === "focus" ? (
            <FocusRail
              selected={selected}
              onSelect={handleSelect}
              onSelectLayer={handleSelectLayer}
            />
          ) : null}
        </>
      ) : (
        <button type="button" className="pt-show" onClick={() => setChrome(true)}>
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
}: {
  selected: string[]
  onSelect: SelectFn
  onSelectLayer: (layer: string) => void
}) {
  const [open, setOpen] = useState<null | "parts" | "inspector">(null)
  return (
    <>
      {open === "parts" ? (
        <FloatingPanel title="Parts" initial={{ x: 24, y: 96 }} width={240} accent="#7dd3fc">
          <PartsTree
            selected={selected}
            onSelect={onSelect}
            onSelectLayer={onSelectLayer}
          />
        </FloatingPanel>
      ) : null}
      {open === "inspector" ? (
        <FloatingPanel
          title="Inspector"
          initial={{ x: typeof window === "undefined" ? 1100 : window.innerWidth - 288, y: 96 }}
          width={264}
          accent="#c4b5fd"
        >
          <Inspector />
        </FloatingPanel>
      ) : null}
      <nav className="pt-command">
        <button type="button" className={open === "parts" ? "is-on" : ""} onClick={() => setOpen(o => (o === "parts" ? null : "parts"))}>
          Parts
        </button>
        <button type="button" className={open === "inspector" ? "is-on" : ""} onClick={() => setOpen(o => (o === "inspector" ? null : "inspector"))}>
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
