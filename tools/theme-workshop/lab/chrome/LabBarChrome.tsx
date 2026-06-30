import type { ReactNode } from "react"
import {
  type LabDeckPanel,
  type LabFloatRect,
  LabPanelDeck,
} from "./LabPanelDeck"

/**
 * Docked / Floating chrome: a persistent top control bar plus the panel deck.
 * The deck reorients the same panel elements between the docked rail and free
 * floating via its `mode`; this composition just chooses which.
 */
export function LabBarChrome({
  controls,
  deckMode,
  panels,
  floatLayout,
  onDockResize,
}: {
  readonly controls: ReactNode
  readonly deckMode: "dock" | "float"
  readonly panels: readonly LabDeckPanel[]
  readonly floatLayout: Record<string, LabFloatRect>
  readonly onDockResize: (width: number) => void
}) {
  return (
    <>
      <header className="pt-topbar">{controls}</header>
      <LabPanelDeck
        mode={deckMode}
        panels={panels}
        floatLayout={floatLayout}
        onDockResize={onDockResize}
      />
    </>
  )
}
