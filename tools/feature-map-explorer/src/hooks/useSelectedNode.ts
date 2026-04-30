import { useAppShell } from "../components/AppShell/AppShell.context"
import type { SelectedNode } from "../types"

/*
 * Convenience hook that returns the selection tuple directly.
 * Equivalent to useAppShell() but trims the surface for compounds that
 * only care about selection (LeftRail rows, Inspector header).
 */
export function useSelectedNode(): readonly [
  SelectedNode | null,
  (next: SelectedNode | null) => void,
] {
  const { selected, setSelected } = useAppShell()
  return [selected, setSelected]
}
