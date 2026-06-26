import { type ReactNode, useEffect, useRef, useState } from "react"
import { LabFloatingPanel } from "./LabFloatingPanel"

export type LabDockPanelDescriptor = {
  readonly id: string
  readonly title: string
  readonly accent: string
  readonly render: () => ReactNode
}

/**
 * Right-hand dock rail. Panels snap into a single contained, scrollable column
 * and never leave the rail, but you can still drag a panel by its title bar to
 * reorder it into another slot (pointer-based, so it works on touch too).
 */
export function LabDockRail({ panels }: { readonly panels: readonly LabDockPanelDescriptor[] }) {
  const ids = panels.map(panel => panel.id)
  const idsKey = ids.join(",")
  const [order, setOrder] = useState<readonly string[]>(ids)
  const railRef = useRef<HTMLDivElement>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const dragRef = useRef<string | null>(null)

  // Keep the order in sync when the available panels change (e.g. Controls
  // appears for a surface), preserving the user's existing arrangement.
  useEffect(() => {
    setOrder(prev => {
      const kept = prev.filter(id => ids.includes(id))
      const added = ids.filter(id => !kept.includes(id))
      return [...kept, ...added]
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey])

  const byId = new Map(panels.map(panel => [panel.id, panel]))

  const startDrag = (id: string) => (event: React.PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return
    dragRef.current = id
    setDragId(id)
    ;(event.target as Element).setPointerCapture?.(event.pointerId)

    const move = (next: PointerEvent) => {
      const rail = railRef.current
      const active = dragRef.current
      if (!rail || !active) return
      const others = Array.from(rail.querySelectorAll<HTMLElement>("[data-dock-id]")).filter(
        element => element.dataset.dockId !== active,
      )
      let beforeId: string | null = null
      for (const element of others) {
        const rect = element.getBoundingClientRect()
        if (next.clientY < rect.top + rect.height / 2) {
          beforeId = element.dataset.dockId ?? null
          break
        }
      }
      setOrder(prev => {
        const without = prev.filter(value => value !== active)
        const index = beforeId ? without.indexOf(beforeId) : without.length
        const result = [...without]
        result.splice(index < 0 ? without.length : index, 0, active)
        return result
      })
    }
    const up = () => {
      dragRef.current = null
      setDragId(null)
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  return (
    <aside className="pt-dock-right" ref={railRef}>
      {order.map(id => {
        const panel = byId.get(id)
        if (!panel) return null
        return (
          <LabFloatingPanel
            key={id}
            docked
            dockId={id}
            dragging={dragId === id}
            onHeaderPointerDown={startDrag(id)}
            title={panel.title}
            initial={{ x: 0, y: 0 }}
            accent={panel.accent}
          >
            {panel.render()}
          </LabFloatingPanel>
        )
      })}
    </aside>
  )
}
