import { createContext, useContext } from "react"
import type { FeatureMap, SelectedNode } from "../../types"

/*
 * AppShell context contract.
 *
 * Per the React compound-component pattern, the Root (AppShell) creates
 * state and renders this Provider; every other compound (TopBar,
 * LeftRail, Canvas, Inspector, Diagnostics) reads via `useAppShell()`.
 *
 * Selection lives in the contract because LeftRail (and later Graph,
 * Inspector, Editor) all read or mutate it. Transient widget-local UI
 * state (filter input, scroll position, hover) stays inside individual
 * components.
 */

export type AppShellStatus = "loading" | "ready" | "missing" | "error"

export type AppShellContextValue = {
  status: AppShellStatus
  map: FeatureMap | null
  error: string | null
  selected: SelectedNode | null
  setSelected: (next: SelectedNode | null) => void
  reload: () => Promise<void>
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
