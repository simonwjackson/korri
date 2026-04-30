import { createContext, useContext } from "react"
import type { FeatureMap, SelectedNode } from "../../types"

/*
 * AppShell context contract.
 *
 * Per the React compound-component pattern, the Root (AppShell) creates
 * state and renders this Provider; every other compound (TopBar,
 * LeftRail, Canvas, Inspector, Diagnostics, Editor) reads via
 * `useAppShell()`.
 *
 * Selection lives here because LeftRail / Graph / Inspector / Editor
 * all read or mutate it. The dirty flag lives here so AppShell can
 * intercept selection changes that would discard unsaved editor state
 * — Editor lifts its dirty bit up via setIsDirty.
 */

export type AppShellStatus = "loading" | "ready" | "missing" | "error"

export type AppShellContextValue = {
  status: AppShellStatus
  map: FeatureMap | null
  error: string | null
  selected: SelectedNode | null
  setSelected: (next: SelectedNode | null) => void
  reload: () => Promise<void>
  isDirty: boolean
  setIsDirty: (next: boolean) => void
  leftRailOpen: boolean
  inspectorOpen: boolean
  toggleLeftRail: () => void
  toggleInspector: () => void
}

const AppShellCtx = createContext<AppShellContextValue | null>(null)

AppShellCtx.displayName = "AppShellCtx"

export const AppShellProvider = AppShellCtx.Provider

export function useAppShell(): AppShellContextValue {
  const ctx = useContext(AppShellCtx)
  if (!ctx) {
    throw new Error("useAppShell must be used within an AppShell")
  }
  return ctx
}
