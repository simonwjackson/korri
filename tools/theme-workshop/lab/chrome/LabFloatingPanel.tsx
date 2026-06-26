import { type CSSProperties, type ReactNode, useCallback, useEffect, useRef, useState } from "react"

type Pos = { readonly x: number; readonly y: number }

export function LabFloatingPanel({
  title,
  children,
  initial,
  width = 248,
  accent = "#7dd3fc",
}: {
  readonly title: string
  readonly children: ReactNode
  readonly initial: Pos
  readonly width?: number
  readonly accent?: string
}) {
  const [pos, setPos] = useState<Pos>(initial)
  const [collapsed, setCollapsed] = useState(false)
  const posRef = useRef(initial)
  posRef.current = pos
  const lastInitial = useRef(initial)

  useEffect(() => {
    if (lastInitial.current.x !== initial.x || lastInitial.current.y !== initial.y) {
      lastInitial.current = initial
      setPos(initial)
    }
  }, [initial])

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    if (event.button !== 0) return
    const startX = event.clientX
    const startY = event.clientY
    const base = posRef.current
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
    const move = (next: PointerEvent) => {
      const x = Math.max(0, Math.min(window.innerWidth - 60, base.x + next.clientX - startX))
      const y = Math.max(0, Math.min(window.innerHeight - 30, base.y + next.clientY - startY))
      setPos({ x, y })
    }
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }, [])

  return (
    <section className="pt-panel" style={{ left: pos.x, top: pos.y, width } as CSSProperties} aria-label={title}>
      <header className="pt-panel-bar" onPointerDown={onPointerDown}>
        <span className="pt-panel-dot" style={{ background: accent }} />
        <span className="pt-panel-title">{title}</span>
        <button
          type="button"
          className="pt-panel-collapse"
          onPointerDown={event => event.stopPropagation()}
          onClick={() => setCollapsed(value => !value)}
          aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
        >
          {collapsed ? "+" : "–"}
        </button>
      </header>
      {collapsed ? null : <div className="pt-panel-body">{children}</div>}
    </section>
  )
}
