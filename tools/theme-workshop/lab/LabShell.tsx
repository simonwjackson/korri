import { type CSSProperties, useEffect, useMemo, useState } from "react"
import { buildStoryIndex } from "./model/lab-part-model"
import { createObjectInstance, DEFAULT_CHROME_MODE, reconcileInstancesWithSelection, type LabCanvasView, type LabChromeMode, type LabObjectInstance } from "./model/lab-canvas-state"
import { DEFAULT_SOURCE_ID, DEFAULT_STATE_ID, sourcesForAdapter, statesForAdapter, type SourceStatus } from "./model/lab-source-state"
import { knobStyle } from "./model/lab-calibration-state"
import { loadSurfacePartsResult, type LabPartsCatalog } from "./parts-discovery"
import { useLab } from "./Lab.context"
import { LabFloatingPanel } from "./chrome/LabFloatingPanel"
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

export function LabShell() {
  const { adapter, initialCanvasView, knobValues } = useLab()
  const [catalog, setCatalog] = useState<LabPartsCatalog | null>(null)
  const [catalogError, setCatalogError] = useState<Error | null>(null)
  const [view, setView] = useState<LabCanvasView>(initialCanvasView)
  const [chromeMode, setChromeMode] = useState<LabChromeMode>(DEFAULT_CHROME_MODE)
  const [chromeVisible, setChromeVisible] = useState(true)
  const [openPanel, setOpenPanel] = useState("parts")
  const [multi, setMulti] = useState(false)
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
    setSelectedIds(prev => {
      if (!additive) return [storyId]
      return prev.includes(storyId) ? prev.filter(id => id !== storyId) : [...prev, storyId]
    })
    setView(additive || multi ? "canvas" : "selection")
  }

  const panels = [
    { id: "parts", label: "Parts", render: () => <LabPartsPanel groups={index.groups} selectedIds={selectedIds} multi={multi} onMultiChange={setMulti} onSelect={(story, additive) => selectStory(story.id, additive)} onSelectLayer={stories => { setSelectedIds(stories.map(story => story.id)); setView("canvas") }} /> },
    { id: "sources", label: "Sources", render: () => <LabSourcesPanel sources={sources} activeId={activeSourceId} onSelect={setActiveSourceId} /> },
    { id: "states", label: "States", render: () => <LabStatesPanel states={states} activeId={activeStateId} onSelect={setActiveStateId} /> },
    { id: "inspector", label: "Inspector", render: () => <LabInspectorPanel /> },
    { id: "devices", label: "Devices", render: () => <LabDevicesPanel /> },
    { id: "controls", label: "Controls", render: () => <LabSurfaceControlsPanel /> },
  ]
  const panelById = new Map(panels.map(panel => [panel.id, panel] as const))
  const activePanel = panelById.get(openPanel) ?? panels[0]
  const compact = typeof window !== "undefined" && window.matchMedia?.("(max-width: 760px), (pointer: coarse)").matches
  const stageStyle = knobStyle(adapter.knobs ?? [], knobValues) as CSSProperties

  return (
    <div className={`lab-shell is-${chromeMode}`} data-chrome={chromeVisible ? "on" : "off"} style={stageStyle}>
      <LabTopBar view={view} onViewChange={setView} chromeMode={chromeMode} onChromeModeChange={setChromeMode} chromeVisible={chromeVisible} onChromeVisibleChange={setChromeVisible} />
      {catalogError ? <div role="alert" className="lab-catalog-error">Failed to load parts: {catalogError.message}</div> : null}
      <main className="lab-shell-canvas">
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
          onSelectStory={storyId => selectStory(storyId)}
          onInstancesChange={setInstances}
        />
      </main>
      {chromeVisible && !compact && chromeMode !== "focus" ? (
        <>
          <LabToolRail open={openPanel} onOpen={setOpenPanel} />
          {chromeMode === "dock" ? (
            <aside className="lab-dock-panel">{activePanel?.render()}</aside>
          ) : (
            <>
              <LabFloatingPanel title="Parts" initial={{ x: 16, y: 72, width: 280 }} accent="#8bd3ff">{panelById.get("parts")?.render()}</LabFloatingPanel>
              <LabFloatingPanel title="Sources" initial={{ x: 312, y: 72, width: 260 }} accent="#f0abfc">{panelById.get("sources")?.render()}</LabFloatingPanel>
              <LabFloatingPanel title="States" initial={{ x: 588, y: 72, width: 260 }} accent="#86efac">{panelById.get("states")?.render()}</LabFloatingPanel>
              <LabFloatingPanel title="Inspector" initial={{ x: window.innerWidth - 312, y: 72, width: 296 }} accent="#fcd34d">{panelById.get("inspector")?.render()}</LabFloatingPanel>
              <LabFloatingPanel title="Devices" initial={{ x: window.innerWidth - 312, y: 360, width: 296 }} accent="#c4b5fd">{panelById.get("devices")?.render()}</LabFloatingPanel>
            </>
          )}
        </>
      ) : null}
      {chromeMode === "focus" || !chromeVisible ? <LabFocusRail view={view} onViewChange={setView} onShowChrome={() => setChromeVisible(true)} /> : null}
      {compact && chromeVisible ? <LabTouchSheet panels={panels} /> : null}
    </div>
  )
}
