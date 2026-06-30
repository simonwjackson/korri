import { type CSSProperties, useEffect, useMemo, useState } from "react"
import { deviceScreens } from "../device-lab"
import { LabCanvasContent } from "./canvas/LabCanvasContent"
import { LabFocusRail } from "./chrome/LabFocusRail"
import {
  DOCK_WIDTH_MAX,
  DOCK_WIDTH_MIN,
  type LabFloatRect,
  LabPanelDeck,
} from "./chrome/LabPanelDeck"
import { LabSettingsModal } from "./chrome/LabSettingsModal"
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
  type LabWorkshopCommand,
  type LabWorkshopCommandSignal,
  type LabWorkshopTool,
  reconcileInstancesWithSelection,
} from "./model/lab-canvas-state"
import {
  buildStoryIndex,
  firstStateFamilyStory,
  statesForStory,
} from "./model/lab-part-model"
import {
  DEFAULT_SOURCE_ID,
  DEFAULT_STATE_ID,
  type SourceStatus,
  sourcesForAdapter,
} from "./model/lab-source-state"
import { LabInspectorPanel } from "./panels/LabInspectorPanel"
import { LabPartsPanel } from "./panels/LabPartsPanel"
import { LabSourcesPanel } from "./panels/LabSourcesPanel"
import { LabStatesPanel } from "./panels/LabStatesPanel"
import { LabSurfaceControlsPanel } from "./panels/LabSurfaceControlsPanel"
import { type LabPartsCatalog, loadSurfacePartsResult } from "./parts-discovery"
import { useLabAxisController } from "./useLabAxisController"

const DOCK_WIDTH_KEY = "lab-dock-width"
const DEFAULT_DOCK_WIDTH = 280

function readStoredDockWidth(): number {
  if (typeof window === "undefined") return DEFAULT_DOCK_WIDTH
  const raw = Number(window.localStorage.getItem(DOCK_WIDTH_KEY))
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_DOCK_WIDTH
  return Math.max(DOCK_WIDTH_MIN, Math.min(DOCK_WIDTH_MAX, raw))
}

const CANVAS_VIEWS: { readonly id: LabCanvasView; readonly label: string }[] = [
  { id: "device", label: "Device" },
  { id: "compose", label: "Compose" },
]

export function LabShell() {
  const { adapter, initialCanvasView, knobValues, selectedDevices } = useLab()
  const [catalog, setCatalog] = useState<LabPartsCatalog | null>(null)
  const [catalogError, setCatalogError] = useState<Error | null>(null)
  const [view, setView] = useState<LabCanvasView>(initialCanvasView)
  const [chromeMode, setChromeMode] =
    useState<LabChromeMode>(DEFAULT_CHROME_MODE)
  const [dockWidth, setDockWidth] = useState<number>(readStoredDockWidth)
  const [chromeVisible, setChromeVisible] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [workshopTool, setWorkshopTool] = useState<LabWorkshopTool>("select")
  const [workshopCommand, setWorkshopCommand] =
    useState<LabWorkshopCommandSignal | null>(null)
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([])
  const [workshopScreenId, setWorkshopScreenId] = useState<string | null>(null)
  const sources = useMemo(() => sourcesForAdapter(adapter), [adapter])
  const [activeSourceId, setActiveSourceId] = useState(
    sources[0]?.id ?? DEFAULT_SOURCE_ID,
  )
  const [instances, setInstances] = useState<readonly LabObjectInstance[]>([])
  // Parts are the surface's static discovered *.part.tsx components only — never
  // the surface's routes. The live, router-driven surface lives in the Preview
  // view; Parts stay isolated from the router.
  const index = useMemo(() => buildStoryIndex(catalog), [catalog])
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

  // The page-axis lifecycle — active screen's axes, the pinned/Live map, derived
  // Inspect/Live mode, pin/release side effects (incl. nested-axis release),
  // capture-back, and the release-on-selection-change cleanup — lives in a
  // focused controller so its ordering contract is in one place.
  const {
    screenAxes,
    activeByAxis,
    mode,
    pinAxis,
    liveAxis,
    pinCurrent,
    toggleMode,
  } = useLabAxisController(adapter)

  useEffect(() => {
    setView(initialCanvasView)
  }, [initialCanvasView])

  useEffect(() => {
    setActiveSourceId(sources[0]?.id ?? DEFAULT_SOURCE_ID)
  }, [sources])

  // When the selected part changes, snap the active state to that part's
  // default (its "ready" tag if present, else its first state).
  useEffect(() => {
    setActiveStateId(defaultStateId)
  }, [defaultStateId])

  // Tapping a state in the dock is the active state for the current selection:
  // bind every placed object to it (so Selection/Canvas re-render), and when
  // nothing is selected, show it on the fallback family part in Compose.
  const selectState = (stateId: SourceStatus) => {
    setActiveStateId(stateId)
    setInstances(prev => prev.map(instance => ({ ...instance, stateId })))
    if (!primaryStory && fallbackStateStory) {
      setSelectedIds([fallbackStateStory.id])
      setView("compose")
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

  // The Parts panel is a palette: each pick toggles that part onto the Compose
  // board (one part is just the n=1 case). There is no separate single-part
  // mode.
  const selectStory = (storyId: string) => {
    setSelectedIds(prev =>
      prev.includes(storyId)
        ? prev.filter(id => id !== storyId)
        : [...prev, storyId],
    )
    setView("compose")
  }

  const selectLayer = (stories: readonly { id: string }[]) => {
    setSelectedIds(stories.map(story => story.id))
    setView("compose")
  }

  const clearAll = () => {
    setSelectedIds([])
    setInstances([])
  }

  const switchWorkshopTool = (tool: LabWorkshopTool) => {
    setWorkshopTool(tool)
    setView("compose")
  }

  const sendWorkshopCommand = (command: LabWorkshopCommand) => {
    setWorkshopCommand(prev => ({ id: (prev?.id ?? 0) + 1, command }))
    setView("compose")
  }

  const partsPanel = () => (
    <LabPartsPanel
      groups={index.groups}
      selectedIds={selectedIds}
      onSelect={story => selectStory(story.id)}
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
  // Live state-machine axes belong to the Device frame (they drive the running
  // surface). In Compose, the panel shows the part's own fixture states instead.
  const panelAxes = view === "device" ? screenAxes : []
  const statesPanel = () => (
    <LabStatesPanel
      axes={panelAxes}
      activeByAxis={activeByAxis}
      onPin={pinAxis}
      onLive={liveAxis}
      onPinCurrent={pinCurrent}
      states={states}
      activeId={activeStateId}
      onSelect={selectState}
      hasSelection={Boolean(primaryStory)}
    />
  )
  const inspectorPanel = () => <LabInspectorPanel />
  const controlsPanel = () => <LabSurfaceControlsPanel />
  const hasControls = Boolean(adapter.useControls)

  const sheetPanels = [
    { id: "parts", label: "Parts", render: partsPanel },
    { id: "sources", label: "Sources", render: sourcesPanel },
    { id: "states", label: "States", render: statesPanel },
    { id: "inspector", label: "Inspector", render: inspectorPanel },
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

  // Compose renders one logical screen at a time; a multi-screen device only
  // contributes selectable screen aspects here. Physical arrangement is the
  // Device frame's job. Resolve the chosen screen against the active device,
  // defaulting to its primary.
  const activeDevice = selectedDevices[0]
  const activeScreens = activeDevice ? deviceScreens(activeDevice) : []
  const resolvedScreenId =
    activeScreens.find(screen => screen.id === workshopScreenId)?.id ??
    activeScreens[0]?.id ??
    null

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
    inspector: { x: w - 300, y: 110, width: 252 },
    controls: { x: 348, y: 120, width: 236 },
  }
  const knobVars = knobStyle(adapter.knobs ?? [], knobValues) as Record<
    string,
    string | number
  >
  const canvasStyle = knobVars as CSSProperties

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
          <div className="pt-seg pt-seg-sm" role="tablist" aria-label="View">
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
          activeSourceId={activeSourceId}
          activeStateId={activeStateId}
          workshopTool={workshopTool}
          workshopCommand={workshopCommand}
          workshopScreenId={resolvedScreenId}
          onSelectStory={storyId => selectStory(storyId)}
          onInstancesChange={setInstances}
        />
      </div>

      {chromeVisible ? (
        <>
          <LabTopBar
            chromeMode={chromeMode}
            onChromeModeChange={setChromeMode}
            onHideChrome={() => setChromeVisible(false)}
            onOpenSettings={() => setSettingsOpen(true)}
            compact={compact}
            screenChoices={view === "compose" ? activeScreens : undefined}
            activeScreenId={resolvedScreenId ?? undefined}
            onScreenChange={setWorkshopScreenId}
            inspectLive={
              view === "device" && screenAxes.length > 0 ? mode : null
            }
            onToggleInspectLive={toggleMode}
          />

          {compact ? <LabTouchSheet panels={sheetPanels} /> : null}

          {!compact && chromeMode !== "focus" ? (
            <>
              <LabToolRail
                docked={chromeMode === "dock"}
                tool={workshopTool}
                hasObjects={instances.length > 0}
                onToolChange={switchWorkshopTool}
                onCommand={sendWorkshopCommand}
                onClear={clearAll}
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
      <LabSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  )
}
