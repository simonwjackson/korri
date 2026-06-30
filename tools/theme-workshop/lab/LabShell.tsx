import { type CSSProperties, useEffect, useMemo, useState } from "react"
import { deviceScreens } from "../device-lab"
import { LabCanvasContent } from "./canvas/LabCanvasContent"
import { LabBarChrome } from "./chrome/LabBarChrome"
import { LabControls } from "./chrome/LabControls"
import { LabOverlayChrome } from "./chrome/LabOverlayChrome"
import {
  DOCK_WIDTH_MAX,
  DOCK_WIDTH_MIN,
  type LabFloatRect,
} from "./chrome/LabPanelDeck"
import { LabSettingsModal } from "./chrome/LabSettingsModal"
import {
  type LabPresentation,
  NARROW_QUERY,
  persistPresentation,
  readStoredPresentation,
  viewportPresentation,
} from "./chrome/lab-presentation"
import { useLab } from "./Lab.context"
import { knobStyle } from "./model/lab-calibration-state"
import {
  bindObjectInstance,
  bindObjectStateGroup,
  type LabCanvasView,
  type LabObjectInstance,
  type LabWorkshopCommand,
  type LabWorkshopCommandSignal,
  type LabWorkshopTool,
  reconcileInstancesWithSelection,
} from "./model/lab-canvas-state"
import {
  objectStateGroupsForStory,
  resolveObjectStateGroupValues,
} from "./model/lab-object-state-groups"
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
import { LabDeviceInspector } from "./panels/LabDeviceInspector"
import { LabDevicePanel } from "./panels/LabDevicePanel"
import { LabInspectorPanel } from "./panels/LabInspectorPanel"
import { LabObjectInspector } from "./panels/LabObjectInspector"
import { LabPartsPanel } from "./panels/LabPartsPanel"
import { LabPartsViewToggle } from "./panels/LabPartsViewToggle"
import { LabSurfaceControlsPanel } from "./panels/LabSurfaceControlsPanel"
import {
  type LabPartsView,
  persistPartsView,
  readStoredPartsView,
} from "./panels/lab-parts-view"
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
  const [dockWidth, setDockWidth] = useState<number>(readStoredDockWidth)
  // One adaptive chrome: position defaults from the viewport and is overridable
  // by the user. Effective = explicit choice ?? viewport default.
  const [userPresentation, setUserPresentation] =
    useState<LabPresentation | null>(readStoredPresentation)
  const [autoPresentation, setAutoPresentation] =
    useState<LabPresentation>(viewportPresentation)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [workshopTool, setWorkshopTool] = useState<LabWorkshopTool>("select")
  const [workshopCommand, setWorkshopCommand] =
    useState<LabWorkshopCommandSignal | null>(null)
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([])
  const [workshopScreenId, setWorkshopScreenId] = useState<string | null>(null)
  const [partsView, setPartsView] = useState<LabPartsView>(readStoredPartsView)
  const sources = useMemo(() => sourcesForAdapter(adapter), [adapter])
  const [activeSourceId, setActiveSourceId] = useState(
    sources[0]?.id ?? DEFAULT_SOURCE_ID,
  )
  const [instances, setInstances] = useState<readonly LabObjectInstance[]>([])
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null)
  const bindObject = (
    id: string,
    patch: Partial<Pick<LabObjectInstance, "sourceId">>,
  ) => setInstances(prev => bindObjectInstance(prev, id, patch))
  const bindObjectState = (id: string, groupId: string, stateId: string) =>
    setInstances(prev => bindObjectStateGroup(prev, id, groupId, stateId))
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
  const { screenAxes, activeByAxis, mode, pinAxis, liveAxis, pinCurrent } =
    useLabAxisController(adapter)
  const presentation = userPresentation ?? autoPresentation
  const choosePresentation = (next: LabPresentation) => {
    setUserPresentation(next)
    persistPresentation(next)
  }

  // Follow the viewport so the default position tracks the screen until the
  // user explicitly picks one.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return
    const query = window.matchMedia(NARROW_QUERY)
    const update = () =>
      setAutoPresentation(query.matches ? "overlay" : "workspace")
    update()
    query.addEventListener?.("change", update)
    return () => query.removeEventListener?.("change", update)
  }, [])

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
        stateGroupValuesForStory: storyId => {
          const story = index.byId.get(storyId)
          if (!story) return {}
          return resolveObjectStateGroupValues(
            objectStateGroupsForStory(story, index.byId, adapter),
            {},
          )
        },
      }),
    )
  }, [selectedIds, activeSourceId, index, adapter])

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
    setSelectedObjectId(null)
  }

  const switchWorkshopTool = (tool: LabWorkshopTool) => {
    setWorkshopTool(tool)
    setView("compose")
  }

  const sendWorkshopCommand = (command: LabWorkshopCommand) => {
    setWorkshopCommand(prev => ({ id: (prev?.id ?? 0) + 1, command }))
    setView("compose")
  }

  const choosePartsView = (next: LabPartsView) => {
    setPartsView(next)
    persistPartsView(next)
  }
  const partsAction = (
    <LabPartsViewToggle mode={partsView} onChange={choosePartsView} />
  )
  const partsPanel = () => (
    <LabPartsPanel
      mode={partsView}
      catalog={catalog}
      index={index}
      selectedIds={selectedIds}
      onSelect={selectStory}
      onSelectLayer={selectLayer}
    />
  )
  // The Inspector scopes to the selected Compose object (its bindings are an
  // open-ended axis list), and otherwise edits the whole canvas.
  const selectedObject =
    instances.find(instance => instance.id === selectedObjectId) ?? null
  const selectedObjectStory = selectedObject
    ? (index.byId.get(selectedObject.storyId) ?? null)
    : null
  // Inspector scope follows the view: the Device frame edits the running
  // surface's live state-machine axes; Compose edits the selected object's
  // bindings, falling back to whole-canvas theme knobs.
  // The Inspector coalesces everything into one surface: a view-scoped context
  // section (Device live axes / selected-object bindings, both as dropdowns) on
  // top, and the intrinsic-design sliders always present below.
  const inspectorPanel = () => (
    <div className="pt-inspect">
      {view === "device" ? (
        <LabDeviceInspector
          axes={screenAxes}
          activeByAxis={activeByAxis}
          onPin={pinAxis}
          onLive={liveAxis}
          onPinCurrent={pinCurrent}
        />
      ) : selectedObject && selectedObjectStory ? (
        <LabObjectInspector
          instance={selectedObject}
          story={selectedObjectStory}
          byId={index.byId}
          sources={sources}
          onBind={bindObject}
          onBindStateGroup={bindObjectState}
        />
      ) : null}
      <LabInspectorPanel />
    </div>
  )
  const controlsPanel = () => <LabSurfaceControlsPanel />
  const devicePanel = () => <LabDevicePanel />
  const hasControls = Boolean(adapter.useControls)

  const sheetPanels = [
    { id: "device", label: "Device", render: devicePanel },
    { id: "parts", label: "Parts", render: partsPanel, action: partsAction },
    { id: "inspector", label: "Inspector", render: inspectorPanel },
    ...(hasControls
      ? [{ id: "controls", label: "Controls", render: controlsPanel }]
      : []),
  ]
  const deckPanels = [
    {
      id: "device",
      title: "Device",
      accent: "#fcd34d",
      render: devicePanel,
    },
    {
      id: "parts",
      title: "Parts",
      accent: "#7dd3fc",
      render: partsPanel,
      action: partsAction,
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

  const w = typeof window === "undefined" ? 1440 : window.innerWidth
  const floatLayout: Record<string, LabFloatRect> = {
    device: { x: 600, y: 120, width: 236 },
    parts: { x: 96, y: 120, width: 236 },
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

  // One control cluster, built once and reflowed into whichever chrome position
  // is active. Same components, different position.
  const controls = (
    <LabControls
      views={CANVAS_VIEWS}
      view={view}
      onViewChange={setView}
      screenChoices={view === "compose" ? activeScreens : undefined}
      activeScreenId={resolvedScreenId ?? undefined}
      onScreenChange={setWorkshopScreenId}
      tool={workshopTool}
      hasObjects={instances.length > 0}
      onToolChange={switchWorkshopTool}
      onCommand={sendWorkshopCommand}
      onClear={clearAll}
      presentation={presentation}
      onPresentationChange={choosePresentation}
      onOpenSettings={() => setSettingsOpen(true)}
    />
  )

  return (
    <div
      className="pt-shell"
      data-present={presentation}
      data-lab-mode={mode}
      style={shellStyle}
    >
      <div className="pt-canvas" style={canvasStyle}>
        {catalogError ? (
          <div role="alert" className="lab-catalog-error">
            Failed to load parts: {catalogError.message}
          </div>
        ) : null}

        <LabCanvasContent
          view={view}
          index={index}
          instances={instances}
          activeSourceId={activeSourceId}
          activeStateId={activeStateId}
          workshopTool={workshopTool}
          workshopCommand={workshopCommand}
          workshopScreenId={resolvedScreenId}
          selectedObjectId={selectedObjectId}
          onSelectObject={setSelectedObjectId}
          onInstancesChange={setInstances}
        />
      </div>

      {presentation === "overlay" ? (
        <LabOverlayChrome controls={controls} panels={sheetPanels} />
      ) : (
        <LabBarChrome
          controls={controls}
          deckMode="float"
          panels={deckPanels}
          floatLayout={floatLayout}
          onDockResize={setDockWidth}
        />
      )}
      <LabSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  )
}
