import { type CSSProperties, useEffect, useMemo, useState } from "react"
import { buildStoryIndex } from "./model/lab-part-model"
import {
  DEFAULT_CHROME_MODE,
  reconcileInstancesWithSelection,
  type LabCanvasView,
  type LabChromeMode,
  type LabObjectInstance,
} from "./model/lab-canvas-state"
import {
  DEFAULT_SOURCE_ID,
  DEFAULT_STATE_ID,
  sourcesForAdapter,
  statesForAdapter,
  type SourceStatus,
} from "./model/lab-source-state"
import { knobStyle } from "./model/lab-calibration-state"
import { loadSurfacePartsResult, type LabPartsCatalog } from "./parts-discovery"
import { useLab } from "./Lab.context"
import { DOCK_WIDTH_MAX, DOCK_WIDTH_MIN, LabPanelDeck, type LabFloatRect } from "./chrome/LabPanelDeck"
import { LabFocusRail } from "./chrome/LabFocusRail"
import { LabToolRail } from "./chrome/LabToolRail"
import { LabTopBar } from "./chrome/LabTopBar"
import { LabTouchSheet } from "./chrome/LabTouchSheet"
import { LabCanvasContent } from "./canvas/LabCanvasContent"
import { LabDevicesPanel } from "./panels/LabDevicesPanel"
import { LabInspectorPanel } from "./panels/LabInspectorPanel"
import { LabPartsPanel } from "./panels/LabPartsPanel"
import { LabSourcesPanel } from "./panels/LabSourcesPanel"
import { LabStatesPanel } from "./panels/LabStatesPanel"
import { LabSurfaceControlsPanel } from "./panels/LabSurfaceControlsPanel"

const DOCK_WIDTH_KEY = "lab-dock-width"
const DEFAULT_DOCK_WIDTH = 280

function readStoredDockWidth(): number {
  if (typeof window === "undefined") return DEFAULT_DOCK_WIDTH
  const raw = Number(window.localStorage.getItem(DOCK_WIDTH_KEY))
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_DOCK_WIDTH
  return Math.max(DOCK_WIDTH_MIN, Math.min(DOCK_WIDTH_MAX, raw))
}

const CANVAS_VIEWS: { readonly id: LabCanvasView; readonly label: string }[] = [
  { id: "surface", label: "Surface" },
  { id: "selection", label: "Selection" },
  { id: "matrix", label: "Matrix" },
  { id: "gallery", label: "Gallery" },
]

export function LabShell() {
  const { adapter, initialCanvasView, knobValues } = useLab()
  const [catalog, setCatalog] = useState<LabPartsCatalog | null>(null)
  const [catalogError, setCatalogError] = useState<Error | null>(null)
  const [view, setView] = useState<LabCanvasView>(initialCanvasView)
  const [chromeMode, setChromeMode] = useState<LabChromeMode>(DEFAULT_CHROME_MODE)
  const [dockWidth, setDockWidth] = useState<number>(readStoredDockWidth)
  const [chromeVisible, setChromeVisible] = useState(true)
  const [openPanel, setOpenPanel] = useState("parts")
  const [multi, setMulti] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [accent, setAccent] = useState("#7dd3fc")
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([])
  const sources = useMemo(() => sourcesForAdapter(adapter), [adapter])
  const states = useMemo(() => statesForAdapter(adapter), [adapter])
  const [activeSourceId, setActiveSourceId] = useState(sources[0]?.id ?? DEFAULT_SOURCE_ID)
  const [activeStateId, setActiveStateId] = useState<SourceStatus>(states[0]?.id ?? DEFAULT_STATE_ID)
  const [instances, setInstances] = useState<readonly LabObjectInstance[]>([])
  const index = useMemo(() => buildStoryIndex(catalog), [catalog])

  useEffect(() => {
    setView(initialCanvasView)
  }, [initialCanvasView, adapter.id])

  useEffect(() => {
    setActiveSourceId(sources[0]?.id ?? DEFAULT_SOURCE_ID)
  }, [sources])

  useEffect(() => {
    setActiveStateId(states[0]?.id ?? DEFAULT_STATE_ID)
  }, [states])

  useEffect(() => {
    let cancelled = false
    setCatalog(null)
    setCatalogError(null)
    setSelectedIds([])
    setInstances([])
    void loadSurfacePartsResult(adapter.id)
      .then(next => {
        if (!cancelled) setCatalog(next)
      })
      .catch(cause => {
        if (!cancelled) setCatalogError(cause instanceof Error ? cause : new Error(String(cause)))
      })
    return () => {
      cancelled = true
    }
  }, [adapter.id])

  useEffect(() => {
    setInstances(prev => reconcileInstancesWithSelection(prev, selectedIds, { sourceId: activeSourceId, stateId: activeStateId }))
  }, [selectedIds, activeSourceId, activeStateId])

  const selectStory = (storyId: string, additive = false) => {
    const add = additive || multi
    setSelectedIds(prev => {
      if (!add) return [storyId]
      return prev.includes(storyId) ? prev.filter(id => id !== storyId) : [...prev, storyId]
    })
    setView(add ? "canvas" : "selection")
  }

  const selectLayer = (stories: readonly { id: string }[]) => {
    setSelectedIds(stories.map(story => story.id))
    setView("canvas")
  }

  const clearAll = () => {
    setSelectedIds([])
    setInstances([])
  }

  const partsPanel = () => (
    <LabPartsPanel
      groups={index.groups}
      selectedIds={selectedIds}
      onSelect={(story, additive) => selectStory(story.id, additive)}
      onSelectLayer={selectLayer}
    />
  )
  const sourcesPanel = () => <LabSourcesPanel sources={sources} activeId={activeSourceId} onSelect={setActiveSourceId} />
  const statesPanel = () => <LabStatesPanel states={states} activeId={activeStateId} onSelect={setActiveStateId} />
  const inspectorPanel = () => <LabInspectorPanel accent={accent} onAccent={setAccent} />
  const devicesPanel = () => <LabDevicesPanel />
  const controlsPanel = () => <LabSurfaceControlsPanel />
  const hasControls = Boolean(adapter.useControls)

  const sheetPanels = [
    { id: "parts", label: "Parts", render: partsPanel },
    { id: "sources", label: "Sources", render: sourcesPanel },
    { id: "states", label: "States", render: statesPanel },
    { id: "inspector", label: "Inspector", render: inspectorPanel },
    { id: "devices", label: "Devices", render: devicesPanel },
    ...(hasControls ? [{ id: "controls", label: "Controls", render: controlsPanel }] : []),
  ]
  const deckPanels = [
    { id: "parts", title: "Parts", accent: "#7dd3fc", render: partsPanel },
    { id: "sources", title: "Sources", accent: "#f0abfc", render: sourcesPanel },
    { id: "states", title: "States", accent: "#86efac", render: statesPanel },
    { id: "devices", title: "Devices", accent: "#fcd34d", render: devicesPanel },
    { id: "inspector", title: "Inspector", accent: "#c4b5fd", render: inspectorPanel },
    ...(hasControls ? [{ id: "controls", title: "Controls", accent: "#fca5a5", render: controlsPanel }] : []),
  ]

  const compact = typeof window !== "undefined" && Boolean(window.matchMedia?.("(max-width: 760px), (pointer: coarse)")?.matches)
  const w = typeof window === "undefined" ? 1440 : window.innerWidth
  const floatLayout: Record<string, LabFloatRect> = {
    parts: { x: 96, y: 120, width: 236 },
    sources: { x: 96, y: 430, width: 236 },
    states: { x: 348, y: 430, width: 236 },
    devices: { x: w - 300, y: 430, width: 252 },
    inspector: { x: w - 300, y: 110, width: 252 },
    controls: { x: 348, y: 120, width: 236 },
  }
  const knobVars = knobStyle(adapter.knobs ?? [], knobValues) as Record<string, string | number>
  const canvasStyle = { ...knobVars, "--k-accent": accent } as CSSProperties
  const showZoom = view === "selection" && !compact

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(DOCK_WIDTH_KEY, String(dockWidth))
    } catch {
      // Ignore storage failures (private mode, quota) — width just won't persist.
    }
  }, [dockWidth])

  const shellStyle = { "--lab-dock-w": `${dockWidth}px` } as CSSProperties

  return (
    <div className={`pt-shell pt-${chromeMode}`} data-chrome={chromeVisible ? "on" : "off"} style={shellStyle}>
      <div className="pt-canvas" style={canvasStyle}>
        <div className="pt-canvas-bar">
          <div className="pt-seg pt-seg-sm" role="tablist" aria-label="Canvas view">
            {CANVAS_VIEWS.map(candidate => (
              <button
                key={candidate.id}
                type="button"
                role="tab"
                aria-selected={view === candidate.id}
                className={`pt-seg-btn${view === candidate.id ? " is-on" : ""}`}
                onClick={() => setView(candidate.id)}
              >
                {candidate.label}
              </button>
            ))}
          </div>
          <button type="button" className={`pt-multi${multi ? " is-on" : ""}`} aria-pressed={multi} onClick={() => setMulti(value => !value)}>
            {multi ? "◉" : "○"} Multi
          </button>
          {instances.length > 0 ? (
            <>
              <span className="pt-canvas-count">{instances.length} object{instances.length === 1 ? "" : "s"}</span>
              <button type="button" className="pt-canvas-clear" onClick={clearAll}>Clear</button>
            </>
          ) : null}
        </div>

        {catalogError ? <div role="alert" className="lab-catalog-error">Failed to load parts: {catalogError.message}</div> : null}

        <LabCanvasContent
          view={view}
          catalog={catalog}
          index={index}
          selectedIds={selectedIds}
          instances={instances}
          sources={sources}
          states={states}
          activeSourceId={activeSourceId}
          activeStateId={activeStateId}
          zoom={zoom}
          onSelectStory={storyId => selectStory(storyId)}
          onInstancesChange={setInstances}
        />

        {showZoom ? (
          <div className="pt-zoombar">
            <button type="button" aria-label="Zoom out" onClick={() => setZoom(z => Math.max(0.4, Number((z - 0.1).toFixed(2))))}>–</button>
            <span>{Math.round(zoom * 100)}%</span>
            <button type="button" aria-label="Zoom in" onClick={() => setZoom(z => Math.min(2, Number((z + 0.1).toFixed(2))))}>+</button>
          </div>
        ) : null}
      </div>

      {chromeVisible ? (
        <>
          <LabTopBar chromeMode={chromeMode} onChromeModeChange={setChromeMode} onHideChrome={() => setChromeVisible(false)} compact={compact} />

          {compact ? <LabTouchSheet panels={sheetPanels} /> : null}

          {!compact && chromeMode !== "focus" ? (
            <>
              <LabToolRail docked={chromeMode === "dock"} open={openPanel} onOpen={setOpenPanel} />
              <LabPanelDeck mode={chromeMode} panels={deckPanels} floatLayout={floatLayout} onDockResize={setDockWidth} />
            </>
          ) : null}

          {!compact && chromeMode === "focus" ? (
            <LabFocusRail panels={sheetPanels} />
          ) : null}
        </>
      ) : (
        <button type="button" className="pt-show" onClick={() => setChromeVisible(true)}>Show UI</button>
      )}
    </div>
  )
}
