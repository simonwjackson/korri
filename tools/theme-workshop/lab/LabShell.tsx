import { type CSSProperties, useEffect, useMemo, useState } from "react"
import { LabCanvasContent } from "./canvas/LabCanvasContent"
import { LabFocusRail } from "./chrome/LabFocusRail"
import {
  DOCK_WIDTH_MAX,
  DOCK_WIDTH_MIN,
  type LabFloatRect,
  LabPanelDeck,
} from "./chrome/LabPanelDeck"
import { LabToolRail } from "./chrome/LabToolRail"
import { LabTopBar } from "./chrome/LabTopBar"
import { LabTouchSheet } from "./chrome/LabTouchSheet"
import { useLab } from "./Lab.context"
import { knobStyle } from "./model/lab-calibration-state"
import {
  DEFAULT_CHROME_MODE,
  type LabCanvasView,
  type LabChromeMode,
  type LabObjectInstance,
  reconcileInstancesWithSelection,
} from "./model/lab-canvas-state"
import {
  buildStoryIndex,
  firstStateFamilyStory,
  statesForStory,
} from "./model/lab-part-model"
import { withScreenStories } from "./model/lab-screen-parts"
import {
  DEFAULT_SOURCE_ID,
  DEFAULT_STATE_ID,
  type SourceStatus,
  sourcesForAdapter,
} from "./model/lab-source-state"
import {
  isAxisLive,
  LAB_AXIS_LIVE,
  type LabAxisActiveMap,
  liveActiveMap,
  pinAxisActive,
  releaseAxisActive,
  restorePinsActive,
} from "./model/lab-state-axis"
import { LabDevicesPanel } from "./panels/LabDevicesPanel"
import { LabInspectorPanel } from "./panels/LabInspectorPanel"
import { LabPartsPanel } from "./panels/LabPartsPanel"
import { LabSourcesPanel } from "./panels/LabSourcesPanel"
import { LabStatesPanel } from "./panels/LabStatesPanel"
import { LabSurfaceControlsPanel } from "./panels/LabSurfaceControlsPanel"
import { type LabPartsCatalog, loadSurfacePartsResult } from "./parts-discovery"

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
  const [chromeMode, setChromeMode] =
    useState<LabChromeMode>(DEFAULT_CHROME_MODE)
  const [dockWidth, setDockWidth] = useState<number>(readStoredDockWidth)
  const [chromeVisible, setChromeVisible] = useState(true)
  const [openPanel, setOpenPanel] = useState("parts")
  const [multi, setMulti] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [accent, setAccent] = useState("#7dd3fc")
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([])
  const sources = useMemo(() => sourcesForAdapter(adapter), [adapter])
  const [activeSourceId, setActiveSourceId] = useState(
    sources[0]?.id ?? DEFAULT_SOURCE_ID,
  )
  const [instances, setInstances] = useState<readonly LabObjectInstance[]>([])
  // The surface's screens ARE its page parts (mounted live); discovered atoms /
  // molecules / etc. stay as static parts in the tree.
  const index = useMemo(
    () => withScreenStories(buildStoryIndex(catalog), adapter.screens ?? []),
    [catalog, adapter],
  )
  // States are dynamic: derived from the selected part's discovered variant
  // family (its real state-machine tags), not a fixed vocabulary.
  const primaryStory = useMemo(() => {
    for (const id of selectedIds) {
      const story = index.byId.get(id)
      if (story) return story
    }
    return null
  }, [selectedIds, index])
  // The States panel reflects the selected part, or — when nothing is selected —
  // the surface's first state family, so a surface's states are visible without
  // hunting for the right part.
  const fallbackStateStory = useMemo(
    () => firstStateFamilyStory(index),
    [index],
  )
  const stateStory = primaryStory ?? fallbackStateStory
  const states = useMemo(
    () => statesForStory(stateStory, index.byId),
    [stateStory, index],
  )
  const defaultStateId =
    states.find(state => state.id.toLowerCase() === "ready")?.id ??
    states[0]?.id ??
    DEFAULT_STATE_ID
  const [activeStateId, setActiveStateId] =
    useState<SourceStatus>(defaultStateId)

  // State AXES for the active screen (the surface's real state machines), wired
  // to the surface's production-inert preview singletons. Default to the first
  // screen that exposes axes (the surface's home); a page selection retargets it.
  const defaultAxisScreenPath = useMemo(() => {
    for (const screen of adapter.screens ?? []) {
      if ((adapter.axesForScreen?.(screen.path) ?? []).length > 0)
        return screen.path
    }
    return "/"
  }, [adapter])
  // A selected screen part retargets the axes to its route; otherwise the
  // default (home) screen's axes are shown so they're visible without hunting.
  const activeScreenPath = primaryStory?.screenPath ?? defaultAxisScreenPath
  const isPageSelection =
    !primaryStory ||
    primaryStory.layer === "page" ||
    primaryStory.layer === "template"
  const screenAxes = useMemo(
    () =>
      isPageSelection ? (adapter.axesForScreen?.(activeScreenPath) ?? []) : [],
    [adapter, activeScreenPath, isPageSelection],
  )
  const [activeByAxis, setActiveByAxis] = useState<LabAxisActiveMap>(() =>
    liveActiveMap(screenAxes),
  )
  // Pins remembered while in Live, so toggling back to Inspect restores them.
  const [rememberedByAxis, setRememberedByAxis] = useState<LabAxisActiveMap>({})
  // Mode is derived: any pinned axis ⇒ Inspect; everything Live ⇒ Live.
  const mode: "inspect" | "live" = screenAxes.some(
    axis => !isAxisLive(activeByAxis[axis.id]),
  )
    ? "inspect"
    : "live"

  // Tapping an axis state pins that axis (Inspect); the Live chip releases it.
  // Both drive the surface singletons, so the mounted surface reflects them.
  const pinAxis = (axisId: string, stateId: string) => {
    const axis = screenAxes.find(candidate => candidate.id === axisId)
    if (!axis) return
    axis.pin(stateId)
    setActiveByAxis(prev => pinAxisActive(prev, axisId, stateId))
  }
  const liveAxis = (axisId: string) => {
    const axis = screenAxes.find(candidate => candidate.id === axisId)
    if (!axis) return
    axis.release()
    setActiveByAxis(prev => releaseAxisActive(prev, axisId))
  }

  // Capture-back: read the running surface's current coordinate and map it onto
  // the axis pins (Live → Inspect), so a live exploration becomes addressable.
  const pinCurrent = () => {
    const captured = adapter.captureCoordinate?.(activeScreenPath)
    if (!captured) return
    for (const axis of screenAxes) {
      const tag = captured[axis.id]
      if (tag && !isAxisLive(tag)) axis.pin(tag)
      else axis.release()
    }
    setActiveByAxis(prev => {
      const next = { ...prev }
      for (const axis of screenAxes)
        next[axis.id] = captured[axis.id] ?? LAB_AXIS_LIVE
      return next
    })
  }

  // The global headline: Live releases every axis (hands the running app the
  // wheel from the current coordinate, route preserved) and remembers the pins;
  // Inspect re-applies them. "Go live from here" falls out for free.
  const toggleMode = () => {
    if (mode === "live") {
      for (const axis of screenAxes) {
        const remembered = rememberedByAxis[axis.id]
        if (remembered && !isAxisLive(remembered)) axis.pin(remembered)
      }
      setActiveByAxis(
        restorePinsActive(screenAxes, activeByAxis, rememberedByAxis),
      )
    } else {
      setRememberedByAxis(activeByAxis)
      for (const axis of screenAxes) axis.release()
      setActiveByAxis(liveActiveMap(screenAxes))
    }
  }

  // Release the previous surface's axis pins on surface switch so a pin can't
  // leak across surfaces (plan risk #1); start the new surface fully Live.
  useEffect(() => {
    setActiveByAxis(
      liveActiveMap(adapter.axesForScreen?.(defaultAxisScreenPath) ?? []),
    )
    setRememberedByAxis({})
    return () => {
      for (const axis of adapter.axesForScreen?.(defaultAxisScreenPath) ?? [])
        axis.release()
    }
  }, [adapter, defaultAxisScreenPath])

  useEffect(() => {
    setView(initialCanvasView)
  }, [initialCanvasView, adapter.id])

  useEffect(() => {
    setActiveSourceId(sources[0]?.id ?? DEFAULT_SOURCE_ID)
  }, [sources])

  // When the selected part changes, snap the active state to that part's
  // default (its "ready" tag if present, else its first state).
  useEffect(() => {
    setActiveStateId(defaultStateId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateStory?.id])

  // Tapping a state in the dock is the active state for the current selection:
  // bind every placed object to it (so Selection/Canvas re-render), and when
  // nothing is selected, preview it on the fallback family part.
  const selectState = (stateId: SourceStatus) => {
    setActiveStateId(stateId)
    setInstances(prev => prev.map(instance => ({ ...instance, stateId })))
    if (!primaryStory && fallbackStateStory) {
      setSelectedIds([fallbackStateStory.id])
      setView("selection")
    }
  }

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
        if (!cancelled)
          setCatalogError(
            cause instanceof Error ? cause : new Error(String(cause)),
          )
      })
    return () => {
      cancelled = true
    }
  }, [adapter.id])

  useEffect(() => {
    setInstances(prev =>
      reconcileInstancesWithSelection(prev, selectedIds, {
        sourceId: activeSourceId,
        stateId: activeStateId,
      }),
    )
  }, [selectedIds, activeSourceId, activeStateId])

  const selectStory = (storyId: string, additive = false) => {
    const add = additive || multi
    setSelectedIds(prev => {
      if (!add) return [storyId]
      return prev.includes(storyId)
        ? prev.filter(id => id !== storyId)
        : [...prev, storyId]
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
  const sourcesPanel = () => (
    <LabSourcesPanel
      sources={sources}
      activeId={activeSourceId}
      onSelect={setActiveSourceId}
    />
  )
  const statesPanel = () => (
    <LabStatesPanel
      axes={screenAxes}
      activeByAxis={activeByAxis}
      onPin={pinAxis}
      onLive={liveAxis}
      onPinCurrent={adapter.captureCoordinate ? pinCurrent : undefined}
      states={states}
      activeId={activeStateId}
      onSelect={selectState}
      hasSelection={Boolean(primaryStory)}
    />
  )
  const inspectorPanel = () => (
    <LabInspectorPanel accent={accent} onAccent={setAccent} />
  )
  const devicesPanel = () => <LabDevicesPanel />
  const controlsPanel = () => <LabSurfaceControlsPanel />
  const hasControls = Boolean(adapter.useControls)

  const sheetPanels = [
    { id: "parts", label: "Parts", render: partsPanel },
    { id: "sources", label: "Sources", render: sourcesPanel },
    { id: "states", label: "States", render: statesPanel },
    { id: "inspector", label: "Inspector", render: inspectorPanel },
    { id: "devices", label: "Devices", render: devicesPanel },
    ...(hasControls
      ? [{ id: "controls", label: "Controls", render: controlsPanel }]
      : []),
  ]
  const deckPanels = [
    { id: "parts", title: "Parts", accent: "#7dd3fc", render: partsPanel },
    {
      id: "sources",
      title: "Sources",
      accent: "#f0abfc",
      render: sourcesPanel,
    },
    { id: "states", title: "States", accent: "#86efac", render: statesPanel },
    {
      id: "devices",
      title: "Devices",
      accent: "#fcd34d",
      render: devicesPanel,
    },
    {
      id: "inspector",
      title: "Inspector",
      accent: "#c4b5fd",
      render: inspectorPanel,
    },
    ...(hasControls
      ? [
          {
            id: "controls",
            title: "Controls",
            accent: "#fca5a5",
            render: controlsPanel,
          },
        ]
      : []),
  ]

  const compact =
    typeof window !== "undefined" &&
    Boolean(
      window.matchMedia?.("(max-width: 760px), (pointer: coarse)")?.matches,
    )
  const w = typeof window === "undefined" ? 1440 : window.innerWidth
  const floatLayout: Record<string, LabFloatRect> = {
    parts: { x: 96, y: 120, width: 236 },
    sources: { x: 96, y: 430, width: 236 },
    states: { x: 348, y: 430, width: 236 },
    devices: { x: w - 300, y: 430, width: 252 },
    inspector: { x: w - 300, y: 110, width: 252 },
    controls: { x: 348, y: 120, width: 236 },
  }
  const knobVars = knobStyle(adapter.knobs ?? [], knobValues) as Record<
    string,
    string | number
  >
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
    <div
      className={`pt-shell pt-${chromeMode}`}
      data-chrome={chromeVisible ? "on" : "off"}
      data-lab-mode={mode}
      style={shellStyle}
    >
      <div className="pt-canvas" style={canvasStyle}>
        <div className="pt-canvas-bar">
          <div
            className="pt-seg pt-seg-sm"
            role="tablist"
            aria-label="Canvas view"
          >
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
          <button
            type="button"
            className={`pt-multi${multi ? " is-on" : ""}`}
            aria-pressed={multi}
            onClick={() => setMulti(value => !value)}
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

        {catalogError ? (
          <div role="alert" className="lab-catalog-error">
            Failed to load parts: {catalogError.message}
          </div>
        ) : null}

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
          axes={screenAxes}
          zoom={zoom}
          onSelectStory={storyId => selectStory(storyId)}
          onInstancesChange={setInstances}
        />

        {showZoom ? (
          <div className="pt-zoombar">
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() =>
                setZoom(z => Math.max(0.4, Number((z - 0.1).toFixed(2))))
              }
            >
              –
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() =>
                setZoom(z => Math.min(2, Number((z + 0.1).toFixed(2))))
              }
            >
              +
            </button>
          </div>
        ) : null}
      </div>

      {chromeVisible ? (
        <>
          <LabTopBar
            chromeMode={chromeMode}
            onChromeModeChange={setChromeMode}
            onHideChrome={() => setChromeVisible(false)}
            compact={compact}
            inspectLive={screenAxes.length > 0 ? mode : null}
            onToggleInspectLive={toggleMode}
          />

          {compact ? <LabTouchSheet panels={sheetPanels} /> : null}

          {!compact && chromeMode !== "focus" ? (
            <>
              <LabToolRail
                docked={chromeMode === "dock"}
                open={openPanel}
                onOpen={setOpenPanel}
              />
              <LabPanelDeck
                mode={chromeMode}
                panels={deckPanels}
                floatLayout={floatLayout}
                onDockResize={setDockWidth}
              />
            </>
          ) : null}

          {!compact && chromeMode === "focus" ? (
            <LabFocusRail panels={sheetPanels} />
          ) : null}
        </>
      ) : (
        <button
          type="button"
          className="pt-show"
          onClick={() => setChromeVisible(true)}
        >
          Show UI
        </button>
      )}
    </div>
  )
}
