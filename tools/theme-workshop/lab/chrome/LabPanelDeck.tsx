import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { LayoutGroup, motion, useReducedMotion } from "framer-motion"

export type LabDeckPanel = {
  readonly id: string
  readonly title: string
  readonly accent: string
  readonly render: () => ReactNode
}

export type LabFloatRect = {
  readonly x: number
  readonly y: number
  readonly width: number
}

const DEFAULT_RECT: LabFloatRect = { x: 120, y: 120, width: 248 }

/**
 * Unified dock/float panel deck.
 *
 * Both modes render the SAME persistent motion.section elements (keyed by id),
 * only their container and positioning change. That persistence is what lets
 * framer-motion's `layout` prop animate each panel gliding to/from the dock
 * when the chrome mode toggles. `layout="position"` animates position only, so
 * the panel size snaps instantly and inner content never scale-distorts.
 *
 * Behaviours preserved from the standalone panels:
 *  - Dock: panels snap into a single contained, scrollable rail; drag a header
 *    to reorder into another slot (pointer-based, touch-friendly).
 *  - Float: panels are free-positioned; drag a header to move anywhere.
 * Active dragging disables that panel's layout animation so it tracks the
 * pointer 1:1 with no spring lag; on release the box is unchanged so re-enabling
 * layout does not animate.
 */
export function LabPanelDeck({
  mode,
  panels,
  floatLayout,
}: {
  readonly mode: "dock" | "float"
  readonly panels: readonly LabDeckPanel[]
  readonly floatLayout: Record<string, LabFloatRect>
}) {
  const reduce = useReducedMotion()
  const dock = mode === "dock"
  const ids = panels.map(panel => panel.id)
  const idsKey = ids.join(",")
  const byId = useMemo(
    () => new Map(panels.map(panel => [panel.id, panel])),
    [panels],
  )

  const [order, setOrder] = useState<readonly string[]>(ids)
  const [floatPos, setFloatPos] =
    useState<Record<string, LabFloatRect>>(floatLayout)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [dragId, setDragId] = useState<string | null>(null)
  const dragRef = useRef<string | null>(null)
  const hostRef = useRef<HTMLDivElement>(null)

  // Keep order + float positions in sync as panels appear/disappear (e.g. the
  // Controls panel only exists for surfaces that declare controls), preserving
  // the user's existing arrangement.
  useEffect(() => {
    setOrder(prev => {
      const kept = prev.filter(id => ids.includes(id))
      const added = ids.filter(id => !kept.includes(id))
      return [...kept, ...added]
    })
    setFloatPos(prev => {
      const next = { ...prev }
      for (const id of ids)
        if (!next[id]) next[id] = floatLayout[id] ?? DEFAULT_RECT
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey])

  const transition = reduce
    ? { duration: 0 }
    : { type: "spring", stiffness: 520, damping: 44 }

  const startDockReorder = (id: string) => (event: React.PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return
    dragRef.current = id
    setDragId(id)
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
    const move = (next: PointerEvent) => {
      const host = hostRef.current
      const active = dragRef.current
      if (!host || !active) return
      const others = Array.from(
        host.querySelectorAll<HTMLElement>("[data-dock-id]"),
      ).filter(element => element.dataset.dockId !== active)
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

  const startFloatMove = (id: string) => (event: React.PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return
    dragRef.current = id
    setDragId(id)
    const startX = event.clientX
    const startY = event.clientY
    const base = floatPos[id] ?? DEFAULT_RECT
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
    const move = (next: PointerEvent) => {
      const x = Math.max(
        0,
        Math.min(window.innerWidth - 60, base.x + next.clientX - startX),
      )
      const y = Math.max(
        0,
        Math.min(window.innerHeight - 30, base.y + next.clientY - startY),
      )
      setFloatPos(prev => ({ ...prev, [id]: { ...(prev[id] ?? base), x, y } }))
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
    <LayoutGroup>
      <div ref={hostRef} className={dock ? "pt-dock-right" : "pt-float-host"}>
        {order.map(id => {
          const panel = byId.get(id)
          if (!panel) return null
          const rect = floatPos[id] ?? DEFAULT_RECT
          const open = !collapsed[id]
          const draggingThis = dragId === id
          const style: CSSProperties = dock
            ? { width: "100%" }
            : {
                position: "fixed",
                left: rect.x,
                top: rect.y,
                width: rect.width,
              }
          return (
            <motion.section
              key={id}
              layout={draggingThis ? false : "position"}
              transition={transition}
              data-dock-id={id}
              className={`pt-panel${dock ? " is-docked" : ""}${draggingThis ? " is-dragging" : ""}`}
              style={style}
              aria-label={panel.title}
            >
              <header
                className="pt-panel-bar"
                onPointerDown={dock ? startDockReorder(id) : startFloatMove(id)}
              >
                <span
                  className="pt-panel-dot"
                  style={{ background: panel.accent }}
                />
                <span className="pt-panel-title">{panel.title}</span>
                <button
                  type="button"
                  className="pt-panel-collapse"
                  onPointerDown={event => event.stopPropagation()}
                  onClick={() =>
                    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }))
                  }
                  aria-label={
                    open ? `Collapse ${panel.title}` : `Expand ${panel.title}`
                  }
                >
                  {open ? "–" : "+"}
                </button>
              </header>
              {open ? (
                <div className="pt-panel-body">{panel.render()}</div>
              ) : null}
            </motion.section>
          )
        })}
      </div>
    </LayoutGroup>
  )
}
