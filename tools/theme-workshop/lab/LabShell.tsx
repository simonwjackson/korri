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
  type LabWorkshopCommand,
  type LabWorkshopCommandSignal,
  type LabWorkshopTool,
  reconcileInstancesWithSelection,
} from "./model/lab-canvas-state"
import {
  bindPlacedPartInput,
  bindPlacedPartObject,
  createLiveDeviceObject,
  isLiveDeviceObject,
  isPlacedPartObject,
  type LabCanvasObject,
  type LabPlacedPartObject,
} from "./model/lab-canvas-object"
import {
  objectInputsForStory,
  resolveObjectInputValues,
} from "./model/lab-object-inputs"
import {
  buildStoryIndex,
  firstStateFamilyStory,
  partLabel,
  statesForStory,
} from "./model/lab-part-model"
import {
  activePreviewTarget,
  type LabPreviewPartTarget,
  type LabPreviewSelection,
  selectPreviewTargetIndex,
} from "./model/lab-preview-selection"
import {
  canonicalInputValue,
  DEFAULT_INPUT_VALUE,
  DEFAULT_SOURCE_ID,
  type LabInputValue,
  sourcesForAdapter,
} from "./model/lab-source-state"
import { LabDeviceInspector } from "./panels/LabDeviceInspector"
import { LabDevicePanel } from "./panels/LabDevicePanel"
import { LabInspectorPanel } from "./panels/LabInspectorPanel"
import { LabObjectInspector } from "./panels/LabObjectInspector"
import { LabPartsPanel } from "./panels/LabPartsPanel"
import { LabPartsViewToggle } from "./panels/LabPartsViewToggle"
import { LabPreviewInspector } from "./panels/LabPreviewInspector"
import { LabSurfaceControlsPanel } from "./panels/LabSurfaceControlsPanel"
import { LabSurfacePanel } from "./panels/LabSurfacePanel"
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

export function LabShell() {
  const { adapter, knobValues, selectedDevices, surfacePath } = useLab()
  const [catalog, setCatalog] = useState<LabPartsCatalog | null>(null)
  const [catalogError, setCatalogError] = useState<Error | null>(null)
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
  const [objects, setObjects] = useState<readonly LabCanvasObject[]>([])
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null)
  const [previewPickMode, setPreviewPickMode] = useState(false)
  const [previewSelection, setPreviewSelection] =
    useState<LabPreviewSelection | null>(null)
  const bindObject = (
    id: string,
    patch: Partial<Pick<LabPlacedPartObject, "sourceId">>,
  ) => setObjects(prev => bindPlacedPartObject(prev, id, patch))
  const bindObjectInputValue = (
    id: string,
    inputId: string,
    value: LabInputValue,
  ) => setObjects(prev => bindPlacedPartInput(prev, id, inputId, value))
  // Parts are the surface's static discovered *.part.tsx components only — never
  // the surface's routes. The live, router-driven surface lives in the Preview
  // view; Parts stay isolated from the router.
  const index = useMemo(() => buildStoryIndex(catalog), [catalog])
  // Live-device seed state stays shared and independent from the Parts palette.
  // Selecting a placed part is a placement/object action; it must not reseed the
  // mounted live device objects.
  const liveStateStory = useMemo(() => firstStateFamilyStory(index), [index])
  const states = useMemo(
    () => statesForStory(liveStateStory, index.byId),
    [liveStateStory, index],
  )
  const defaultStateId =
    states.find(state => state.id.toLowerCase() === "ready")?.id ??
    states[0]?.id ??
    DEFAULT_INPUT_VALUE
  const [activeStateId, setActiveStateId] =
    useState<LabInputValue>(defaultStateId)

  // The page-axis lifecycle — active screen's axes, the pinned/Live map, derived
  // Inspect/Live mode, pin/release side effects (incl. nested-axis release),
  // capture-back, and the release-on-selection-change cleanup — lives in a
  // focused controller so its ordering contract is in one place.
  const { screenAxes, activeByAxis, mode, pinAxis, liveAxis, pinCurrent } =
    useLabAxisController(adapter)
  const screenInputs = useMemo(
    () => adapter.inputsForScreen?.(surfacePath) ?? [],
    [adapter, surfacePath],
  )
  const [screenInputValues, setScreenInputValues] = useState<
    Readonly<Record<string, LabInputValue>>
  >({})
  const presentation = userPresentation ?? autoPresentation
  const choosePresentation = (next: LabPresentation) => {
    setUserPresentation(next)
    persistPresentation(next)
  }
  const changeScreenInput = (inputId: string, value: LabInputValue) => {
    const input = screenInputs.find(candidate => candidate.id === inputId)
    if (!input) return
    const canonical = canonicalInputValue(
      value,
      input.control,
      input.defaultValue,
    )
    setScreenInputValues(prev => ({ ...prev, [inputId]: canonical }))
    input.apply?.(canonical)
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
    if (typeof window === "undefined") return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setPreviewPickMode(false)
      setPreviewSelection(null)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  useEffect(() => {
    setActiveSourceId(sources[0]?.id ?? DEFAULT_SOURCE_ID)
  }, [sources])

  useEffect(() => {
    const values = Object.fromEntries(
      screenInputs.map(input => [
        input.id,
        canonicalInputValue(
          input.defaultValue,
          input.control,
          input.defaultValue,
        ),
      ]),
    )
    setScreenInputValues(values)
    for (const input of screenInputs) input.apply?.(values[input.id])
    return () => {
      for (const input of screenInputs) input.release?.()
    }
  }, [screenInputs])

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
    setObjects(prev => prev.filter(isLiveDeviceObject))
    setPreviewSelection(null)
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
    setObjects(prev => {
      const placedParts = prev.filter(isPlacedPartObject)
      const liveDevices = selectedDevices.map(device => {
        const existing = prev
          .filter(isLiveDeviceObject)
          .find(object => object.deviceId === device.id)
        return existing ?? createLiveDeviceObject(device.id)
      })
      return [...liveDevices, ...placedParts]
    })
  }, [selectedDevices])

  useEffect(() => {
    setObjects(prev => {
      const liveDevices = prev.filter(isLiveDeviceObject)
      const placedParts = reconcileInstancesWithSelection(
        prev.filter(isPlacedPartObject),
        selectedIds,
        {
          sourceId: activeSourceId,
          inputValuesForStory: storyId => {
            const story = index.byId.get(storyId)
            if (!story) return {}
            return resolveObjectInputValues(
              objectInputsForStory(story, index.byId, adapter),
              {},
            )
          },
        },
      )
      return [...liveDevices, ...placedParts]
    })
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
  }

  const selectLayer = (stories: readonly { id: string }[]) => {
    setSelectedIds(stories.map(story => story.id))
  }

  const clearAll = () => {
    setSelectedIds([])
    setObjects(prev => prev.filter(isLiveDeviceObject))
    setSelectedObjectId(null)
    setPreviewSelection(null)
  }

  const switchWorkshopTool = (tool: LabWorkshopTool) => {
    setWorkshopTool(tool)
  }

  const sendWorkshopCommand = (command: LabWorkshopCommand) => {
    setWorkshopCommand(prev => ({ id: (prev?.id ?? 0) + 1, command }))
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
  useEffect(() => {
    if (selectedObjectId && !objects.some(object => object.id === selectedObjectId)) {
      setSelectedObjectId(null)
    }
    if (previewSelection && !objects.some(object => object.id === previewSelection.scopeId)) {
      setPreviewSelection(null)
    }
  }, [objects, selectedObjectId, previewSelection])

  // The Inspector scopes to the selected workspace object or picked inner part.
  const selectObject = (id: string | null) => {
    setSelectedObjectId(id)
    setPreviewSelection(prev => (prev && prev.scopeId !== id ? null : prev))
  }
  const selectedObject =
    objects.find(object => object.id === selectedObjectId) ?? null
  const selectedPlacedObject =
    selectedObject && isPlacedPartObject(selectedObject) ? selectedObject : null
  const selectedLiveObject =
    selectedObject && isLiveDeviceObject(selectedObject) ? selectedObject : null
  const selectedObjectStory = selectedPlacedObject
    ? (index.byId.get(selectedPlacedObject.storyId) ?? null)
    : null
  const selectedPreviewTarget = activePreviewTarget(previewSelection)
  const selectedPreviewObject =
    previewSelection
      ? (objects.find(object => object.id === previewSelection.scopeId) ?? null)
      : null
  const selectedPreviewPlacedObject =
    selectedPreviewObject && isPlacedPartObject(selectedPreviewObject)
      ? selectedPreviewObject
      : null
  const selectedPreviewStory = selectedPreviewTarget
    ? storyForPreviewTarget(index, selectedPreviewTarget)
    : null
  const previewInputs = selectedPreviewStory
    ? (adapter.surfacePartInputs?.(selectedPreviewStory) ?? [])
    : []
  const previewInputValues = Object.fromEntries(
    previewInputs.map(input => [
      input.id,
      canonicalInputValue(
        selectedPreviewPlacedObject
          ? selectedPreviewPlacedObject.inputValues[input.id]
          : screenInputValues[input.id],
        input.control,
        input.defaultValue,
      ),
    ]),
  )
  const changePreviewInput = (inputId: string, value: LabInputValue) => {
    if (selectedPreviewPlacedObject) {
      bindObjectInputValue(selectedPreviewPlacedObject.id, inputId, value)
      return
    }
    changeScreenInput(inputId, value)
  }
  const choosePreviewTargetIndex = (targetIndex: number) =>
    setPreviewSelection(prev =>
      prev ? selectPreviewTargetIndex(prev, targetIndex) : prev,
    )
  const selectPreviewPart = (selection: LabPreviewSelection | null) => {
    setPreviewSelection(selection)
    if (!selection) return
    if (objects.some(object => object.id === selection.scopeId)) {
      setSelectedObjectId(selection.scopeId)
    }
  }
  const clearPreviewSelection = () => {
    setPreviewSelection(null)
    setPreviewPickMode(false)
  }
  // The Inspector is split into two panels: a selection-scoped State panel
  // (shared live-device axes, selected placed-object bindings, or picked inner
  // part controls) and a Design panel (the always-present intrinsic-design
  // sliders for the whole canvas). They edit unrelated things, so they live
  // apart.
  const statePanel = () =>
    previewSelection &&
    selectedPreviewTarget &&
    selectedPreviewObject ? (
      <LabPreviewInspector
        selection={previewSelection}
        story={selectedPreviewStory}
        inputs={previewInputs}
        inputValues={previewInputValues}
        onInputChange={changePreviewInput}
        onSelectTargetIndex={choosePreviewTargetIndex}
        onClearSelection={clearPreviewSelection}
      />
    ) : selectedLiveObject ? (
      <LabDeviceInspector
        axes={screenAxes}
        activeByAxis={activeByAxis}
        inputs={screenInputs}
        inputValues={screenInputValues}
        onInputChange={changeScreenInput}
        onPin={pinAxis}
        onLive={liveAxis}
        onPinCurrent={pinCurrent}
      />
    ) : selectedPlacedObject && selectedObjectStory ? (
      <LabObjectInspector
        instance={selectedPlacedObject}
        story={selectedObjectStory}
        byId={index.byId}
        sources={sources}
        onBind={bindObject}
        onBindInput={bindObjectInputValue}
      />
    ) : (
      <div className="pt-inspector">
        <div className="pt-sources-hint">
          Select an object on the board to edit its state.
        </div>
      </div>
    )
  const designPanel = () => <LabInspectorPanel />
  const controlsPanel = () => <LabSurfaceControlsPanel />
  const devicePanel = () => <LabDevicePanel />
  const surfacePanel = () => <LabSurfacePanel />
  const hasControls = Boolean(adapter.useControls)

  const sheetPanels = [
    { id: "surface", label: "Surface", render: surfacePanel },
    { id: "device", label: "Devices", render: devicePanel },
    { id: "parts", label: "Parts", render: partsPanel, action: partsAction },
    { id: "inspector", label: "Inspector", render: statePanel },
    { id: "design", label: "Design", render: designPanel },
    ...(hasControls
      ? [{ id: "controls", label: "Controls", render: controlsPanel }]
      : []),
  ]
  const deckPanels = [
    {
      id: "surface",
      title: "Surface",
      accent: "#fcd34d",
      render: surfacePanel,
    },
    {
      id: "device",
      title: "Devices",
      accent: "#fbbf24",
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
      render: statePanel,
    },
    {
      id: "design",
      title: "Design",
      accent: "#5eead4",
      render: designPanel,
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

  // Placed part objects render one logical screen aspect at a time; live device
  // objects render their own physical screens. Resolve the chosen aspect against
  // the active device, defaulting to its primary.
  const activeDevice = selectedDevices[0]
  const activeScreens = activeDevice ? deviceScreens(activeDevice) : []
  const resolvedScreenId =
    activeScreens.find(screen => screen.id === workshopScreenId)?.id ??
    activeScreens[0]?.id ??
    null

  const w = typeof window === "undefined" ? 1440 : window.innerWidth
  const floatLayout: Record<string, LabFloatRect> = {
    surface: { x: 600, y: 120, width: 236 },
    device: { x: 600, y: 264, width: 236 },
    parts: { x: 96, y: 120, width: 236 },
    inspector: { x: w - 300, y: 110, width: 252 },
    design: { x: w - 300, y: 392, width: 252 },
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
      screenChoices={activeScreens}
      activeScreenId={resolvedScreenId ?? undefined}
      onScreenChange={setWorkshopScreenId}
      tool={workshopTool}
      hasObjects={objects.some(isPlacedPartObject)}
      onToolChange={switchWorkshopTool}
      onCommand={sendWorkshopCommand}
      onClear={clearAll}
      previewPickMode={previewPickMode}
      onPreviewPickModeChange={setPreviewPickMode}
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
          index={index}
          objects={objects}
          activeSourceId={activeSourceId}
          activeStateId={activeStateId}
          workshopTool={workshopTool}
          workshopCommand={workshopCommand}
          workshopScreenId={resolvedScreenId}
          selectedObjectId={selectedObjectId}
          previewPickMode={previewPickMode}
          previewSelection={previewSelection}
          onPreviewSelectionChange={selectPreviewPart}
          onSelectObject={selectObject}
          onObjectsChange={setObjects}
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

function storyForPreviewTarget(
  index: ReturnType<typeof buildStoryIndex>,
  target: LabPreviewPartTarget,
) {
  for (const group of index.groups) {
    for (const story of group.stories) {
      if (story.layer !== target.layer) continue
      if (story.name === target.name) return story
      if (partLabel(story) === target.name) return story
      if (story.name.startsWith(`${target.name} ·`)) return story
      if (partLabel(story).startsWith(`${target.name} ·`)) return story
    }
  }
  return null
}
