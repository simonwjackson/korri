import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react"

export function LabFloatingPanel({
  title,
  children,
  initial,
  accent = "#8bd3ff",
}: {
  readonly title: string
  readonly children: ReactNode
  readonly initial: { readonly x: number; readonly y: number; readonly width?: number }
  readonly accent?: string
}) {
  const [pos, setPos] = useState(initial)
  const [collapsed, setCollapsed] = useState(false)
  const drag = useRef<{ readonly dx: number; readonly dy: number } | null>(null)

  useEffect(() => setPos(initial), [initial.x, initial.y, initial.width])

  return (
    <section
      className="lab-float-panel"
      style={{ left: pos.x, top: pos.y, width: initial.width ?? 280, "--lab-panel-accent": accent } as CSSProperties}
      aria-label={title}
    >
      <header
        className="lab-float-head"
        onPointerDown={event => {
          const target = event.currentTarget
          target.setPointerCapture(event.pointerId)
          drag.current = { dx: event.clientX - pos.x, dy: event.clientY - pos.y }
        }}
        onPointerMove={event => {
          if (!drag.current) return
          setPos({
            ...pos,
            x: Math.max(8, Math.min(window.innerWidth - 96, event.clientX - drag.current.dx)),
            y: Math.max(8, Math.min(window.innerHeight - 48, event.clientY - drag.current.dy)),
          })
        }}
        onPointerUp={event => {
          event.currentTarget.releasePointerCapture(event.pointerId)
          drag.current = null
        }}
      >
        <span>{title}</span>
        <button
          type="button"
          aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
          onClick={() => setCollapsed(value => !value)}
        >
          {collapsed ? "+" : "–"}
        </button>
      </header>
      {!collapsed ? <div className="lab-float-body">{children}</div> : null}
    </section>
  )
}
