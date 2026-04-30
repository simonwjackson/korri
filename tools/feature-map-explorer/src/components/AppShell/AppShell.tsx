import { type ReactNode, useCallback, useEffect, useState } from "react"
import { useFeatureMap } from "../../hooks/useFeatureMap"
import type { FeatureMap, SelectedNode } from "../../types"
import { AppShellProvider } from "./AppShell.context"

/*
 * Root for the AppShell widget.
 *
 * Owns:
 * - the GET /api/feature-map round-trip (via useFeatureMap)
 * - the currently-selected node reference
 *
 * Renders the Provider plus the three-column grid frame:
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ TopBar (full width)                          │  48px row
 *   ├───────────┬──────────────────────┬───────────┤
 *   │ LeftRail  │ Canvas               │ Inspector │  flex row
 *   │ 280px     │ flex                 │ 360px     │
 *   └───────────┴──────────────────────┴───────────┘
 *
 * Compounds (TopBar / LeftRail / Canvas / Inspector / Diagnostics) read
 * via `useAppShell()` and place themselves into the grid via Tailwind
 * `col-start-*` / `row-start-*` utilities.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const featureMap = useFeatureMap()
  const [selected, setSelectedRaw] = useState<SelectedNode | null>(null)

  // Clear selection when the selected node disappears after a reload.
  useEffect(() => {
    if (!selected || !featureMap.map) return
    if (!nodeExists(featureMap.map, selected)) {
      setSelectedRaw(null)
    }
  }, [featureMap.map, selected])

  const setSelected = useCallback((next: SelectedNode | null) => {
    setSelectedRaw(next)
  }, [])

  return (
    <AppShellProvider
      value={{
        status: featureMap.status,
        map: featureMap.map,
        error: featureMap.error,
        selected,
        setSelected,
        reload: featureMap.reload,
      }}
    >
      <div
        className="grid h-dvh w-dvw bg-bg text-text"
        style={{
          gridTemplateColumns: "280px minmax(0, 1fr) 360px",
          gridTemplateRows: "48px minmax(0, 1fr)",
        }}
      >
        {children}
      </div>
    </AppShellProvider>
  )
}

function nodeExists(map: FeatureMap, ref: SelectedNode): boolean {
  switch (ref.kind) {
    case "job":
      return map.jobs.some(n => n.id === ref.id)
    case "brief":
      return map.briefs.some(n => n.id === ref.id)
    case "feature":
      return map.features.some(n => n.id === ref.id)
    case "bdd":
      return map.bdd.some(n => n.id === ref.id)
  }
}
