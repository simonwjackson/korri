import {
  LayoutGroup,
  motion,
  type Transition,
  useReducedMotion,
} from "framer-motion"
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  computeGroups,
  type Rect,
  reflowStack,
  snapToNeighbors,
  unionBBox,
} from "./lab-panel-groups"

export type LabDeckPanel = {
  readonly id: string
  readonly title: string
  readonly accent: string
  readonly render: () => ReactNode
  /** Optional control rendered on the right of the panel's titlebar. */
  readonly action?: ReactNode
}

export type LabFloatRect = {
  readonly x: number
  readonly y: number
  readonly width: number
  /** Explicit height once the user has resized; absent means size-to-content. */
  readonly height?: number
}

const DEFAULT_RECT: LabFloatRect = { x: 120, y: 120, width: 248 }

/**
 * Unified dock/float panel deck.
 *
 * Both modes render the SAME persistent motion.section elements (keyed by id),
 * only their container and positioning change, which lets framer-motion animate
 * each panel gliding to/from the dock when the chrome mode toggles.
 *
 * Float mode is a lightweight tiling surface:
 *  - Drag a header to move. A panel that abuts another clicks flush into a
 *    stack/row and the two become one connected group (a shared frame draws
 *    around them). Dragging any member of a group moves the whole group.
 *  - Drag a grouped panel's grip to pull just that panel out of the group.
 *  - Drag the bottom-right corner to resize.
 * Dock mode: panels stack in a rail; drag a header to reorder, drag a panel's
 * bottom edge to resize its height, drag the rail's left edge to resize width.
 */
export const DOCK_WIDTH_MIN = 220
export const DOCK_WIDTH_MAX = 640
const FLOAT_MIN_W = 200
const FLOAT_MAX_W = 720
const PANEL_MIN_H = 140
const DOCK_DEFAULT_H = 300
const DOCK_MAX_H = 900
/** Distance (px) within which an edge magnetically snaps to a neighbour line. */
const SNAP = 8
/** Drag a panel/group within this of a side edge to dock it full-height there. */
const EDGE_DOCK = 28
/** Padding/gap of a side dock well, matching the global Docked rail. */
const WELL_PAD = 12
const WELL_GAP = 10

/** True when a panel sits inset in a left/right dock well (not full-width). */
function isSideDocked(r: LabFloatRect, side: "left" | "right"): boolean {
  if (r.width >= window.innerWidth - 4) return false
  return side === "left"
    ? Math.abs(r.x - WELL_PAD) < 1
    : Math.abs(r.x + r.width - (window.innerWidth - WELL_PAD)) < 1
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value))

/** Persisted panel arrangement, so positions survive a browser refresh. */
const LAYOUT_KEY = "lab-panel-layout"
type StoredLayout = {
  readonly order: readonly string[]
  readonly floatPos: Record<string, LabFloatRect>
}
function readStoredLayout(): StoredLayout | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(LAYOUT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredLayout>
    if (parsed && Array.isArray(parsed.order) && parsed.floatPos)
      return { order: parsed.order, floatPos: parsed.floatPos }
  } catch {
    // Ignore malformed/blocked storage; fall back to defaults.
  }
  return null
}
function persistLayout(
  order: readonly string[],
  floatPos: Record<string, LabFloatRect>,
): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(LAYOUT_KEY, JSON.stringify({ order, floatPos }))
  } catch {
    // Ignore storage failures (private mode/quota).
  }
}

/** Keep at least this much of a panel's header on-screen after a resize. */
const HEADER_KEEP = 44
/** Clamp a panel so its header stays reachable inside the current viewport. */
function clampIntoView(
  r: LabFloatRect,
  innerW: number,
  innerH: number,
  barH: number,
): LabFloatRect {
  const x = clamp(r.x, 0, Math.max(0, innerW - r.width))
  const y = clamp(r.y, barH, Math.max(barH, innerH - HEADER_KEEP))
  return x === r.x && y === r.y ? r : { ...r, x, y }
}

/** Snap a moving box's leading edge, trying both its leading and trailing side. */
function snapLeading(lead: number, size: number, lines: readonly number[]) {
  let best = lead
  let bestDist = SNAP + 1
  for (const line of lines) {
    const dLead = Math.abs(lead - line)
    if (dLead < bestDist) {
      bestDist = dLead
      best = line
    }
    const dTrail = Math.abs(lead + size - line)
    if (dTrail < bestDist) {
      bestDist = dTrail
      best = line - size
    }
  }
  return bestDist <= SNAP ? best : lead
}

/** Snap a single edge (e.g. a resizing right/bottom edge) to the nearest line. */
function snapSingleEdge(edge: number, lines: readonly number[]) {
  let best = edge
  let bestDist = SNAP + 1
  for (const line of lines) {
    const dist = Math.abs(edge - line)
    if (dist < bestDist) {
      bestDist = dist
      best = line
    }
  }
  return bestDist <= SNAP ? best : edge
}

function sameRects(a: Record<string, Rect>, b: Record<string, Rect>) {
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  for (const key of keys) {
    const ra = a[key]
    const rb = b[key]
    if (!rb || !ra) return false
    if (
      Math.round(ra.x) !== Math.round(rb.x) ||
      Math.round(ra.y) !== Math.round(rb.y) ||
      Math.round(ra.width) !== Math.round(rb.width) ||
      Math.round(ra.height) !== Math.round(rb.height)
    )
      return false
  }
  return true
}

export function LabPanelDeck({
  mode,
  panels,
  floatLayout,
  onDockResize,
}: {
  readonly mode: "dock" | "float"
  readonly panels: readonly LabDeckPanel[]
  readonly floatLayout: Record<string, LabFloatRect>
  readonly onDockResize?: (width: number) => void
}) {
  const reduce = useReducedMotion()
  const dock = mode === "dock"
  const [resizing, setResizing] = useState(false)

  const startResize = (event: React.PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return
    if (!onDockResize) return
    event.preventDefault()
    setResizing(true)
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
    const move = (next: PointerEvent) => {
      const width = Math.max(
        DOCK_WIDTH_MIN,
        Math.min(DOCK_WIDTH_MAX, window.innerWidth - next.clientX),
      )
      onDockResize(width)
    }
    const up = () => {
      setResizing(false)
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }
  const ids = useMemo(() => panels.map(panel => panel.id), [panels])
  const byId = useMemo(
    () => new Map(panels.map(panel => [panel.id, panel])),
    [panels],
  )

  const [order, setOrder] = useState<readonly string[]>(() => {
    const stored = readStoredLayout()
    if (!stored) return ids
    const kept = stored.order.filter(id => ids.includes(id))
    const added = ids.filter(id => !kept.includes(id))
    return [...kept, ...added]
  })
  const [floatPos, setFloatPos] = useState<Record<string, LabFloatRect>>(() => {
    const stored = readStoredLayout()
    const base: Record<string, LabFloatRect> = { ...floatLayout }
    if (stored)
      for (const [id, rect] of Object.entries(stored.floatPos)) base[id] = rect
    for (const id of ids)
      if (!base[id]) base[id] = floatLayout[id] ?? DEFAULT_RECT
    return base
  })
  const saveTimer = useRef<number | undefined>(undefined)
  const [dockHeights, setDockHeights] = useState<Record<string, number>>({})
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [measured, setMeasured] = useState<Record<string, Rect>>({})
  const [dragId, setDragId] = useState<string | null>(null)
  const [resizeId, setResizeId] = useState<string | null>(null)
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
  }, [ids, floatLayout])

  // Remember the arrangement across refreshes. Debounced so a drag (many
  // position updates) coalesces into a single write.
  useEffect(() => {
    if (typeof window === "undefined") return
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(
      () => persistLayout(order, floatPos),
      250,
    )
    return () => window.clearTimeout(saveTimer.current)
  }, [order, floatPos])

  // Never let a panel hide off-screen: clamp every panel back into view on
  // mount (restored positions may exceed a now-smaller window) and on resize.
  useEffect(() => {
    if (typeof window === "undefined") return
    const apply = () => {
      const barH = hostRef.current?.getBoundingClientRect().top ?? 0
      setFloatPos(prev => {
        let changed = false
        const next: Record<string, LabFloatRect> = {}
        for (const [id, rect] of Object.entries(prev)) {
          const clamped = clampIntoView(
            rect,
            window.innerWidth,
            window.innerHeight,
            barH,
          )
          if (clamped !== rect) changed = true
          next[id] = clamped
        }
        return changed ? next : prev
      })
    }
    apply()
    window.addEventListener("resize", apply)
    return () => window.removeEventListener("resize", apply)
  }, [])

  // Measure live panel geometry so grouping (which panels touch) tracks the
  // real rendered boxes, including auto-height panels. The extra deps are
  // intentional: a position/order/collapse/panel change re-measures the DOM.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps are layout triggers for a DOM read
  useLayoutEffect(() => {
    if (dock) {
      setMeasured(prev => (Object.keys(prev).length ? {} : prev))
      return
    }
    const host = hostRef.current
    if (!host) return
    const next: Record<string, Rect> = {}
    for (const element of host.querySelectorAll<HTMLElement>(
      "[data-dock-id]",
    )) {
      const id = element.dataset.dockId
      if (!id) continue
      const box = element.getBoundingClientRect()
      next[id] = {
        x: box.left,
        y: box.top,
        width: box.width,
        height: box.height,
      }
    }
    setMeasured(prev => (sameRects(prev, next) ? prev : next))
  }, [dock, floatPos, order, collapsed, panels])

  const groups = useMemo(
    () => (dock ? [] : computeGroups(order, measured)),
    [dock, order, measured],
  )
  const memberMap = useMemo(() => {
    const map = new Map<string, readonly string[]>()
    for (const group of groups) for (const id of group) map.set(id, group)
    return map
  }, [groups])

  // Only the dock<->float morph should animate. Any active drag/resize tracks
  // the pointer 1:1, so layout animation is switched off entirely while
  // interacting (otherwise group members / reorder neighbours spring-lag behind
  // the cursor, which feels awful).
  const interacting = dragId !== null || resizeId !== null
  const transition: Transition = reduce
    ? { duration: 0 }
    : { duration: 0.16, ease: [0.2, 0, 0, 1] }

  const liveRect = (id: string): Rect => {
    const m = measured[id]
    if (m) return m
    const f = floatPos[id] ?? DEFAULT_RECT
    return { x: f.x, y: f.y, width: f.width, height: f.height ?? 200 }
  }

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

  const startDockHeightResize = (id: string) => (event: React.PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return
    event.stopPropagation()
    setResizeId(id)
    const startY = event.clientY
    const baseH = dockHeights[id] ?? DOCK_DEFAULT_H
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
    const move = (next: PointerEvent) => {
      const height = clamp(
        baseH + (next.clientY - startY),
        PANEL_MIN_H,
        DOCK_MAX_H,
      )
      setDockHeights(prev => ({ ...prev, [id]: height }))
    }
    const up = () => {
      setResizeId(null)
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  // Move a single panel freely, clicking it flush into neighbouring panels.
  // Used both for ungrouped panels and for tearing a panel out of a group.
  const startSingleMove = (id: string) => (event: React.PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return
    dragRef.current = id
    setDragId(id)
    const startX = event.clientX
    const startY = event.clientY
    const base = floatPos[id] ?? DEFAULT_RECT
    const self = liveRect(id)
    const barH = hostRef.current?.getBoundingClientRect().top ?? 0
    // Header drag carries the grabbed panel and everything stacked below it in
    // its group, detaching from the panels above. Ungrouped panels move alone.
    const group = memberMap.get(id) ?? [id]
    const tail = group.filter(other => liveRect(other).y >= self.y)
    const tailBase: Record<string, LabFloatRect> = {}
    for (const m of tail) tailBase[m] = floatPos[m] ?? DEFAULT_RECT
    const neighbors = order
      .filter(other => !tail.includes(other))
      .map(other => liveRect(other))
    // Horizontal docking disabled: only the viewport sides snap on X.
    const xLines = [0, window.innerWidth]
    const yLines = [
      barH,
      window.innerHeight,
      ...neighbors.flatMap(n => [n.y, n.y + n.height]),
    ]
    // Lay the panels docked to one side as an inset, gapped vertical split that
    // sits inside a padded well (matching the global Docked rail).
    const layoutColumn = (
      pos: Record<string, LabFloatRect>,
      ids: readonly string[],
      side: "left" | "right",
    ): Record<string, LabFloatRect> => {
      if (ids.length === 0) return pos
      const avail =
        window.innerHeight - barH - 2 * WELL_PAD - (ids.length - 1) * WELL_GAP
      const slice = avail / ids.length
      const next = { ...pos }
      let cursor = barH + WELL_PAD
      for (const mid of ids) {
        const r = pos[mid]
        if (!r) continue
        next[mid] = {
          x:
            side === "left" ? WELL_PAD : window.innerWidth - WELL_PAD - r.width,
          y: cursor,
          width: r.width,
          height: slice,
        }
        cursor += slice + WELL_GAP
      }
      return next
    }
    // Re-split a side well to fill the height, leaving out the dragged panel.
    // Run when a panel leaves a column so the remaining ones re-expand.
    const rebalance = (
      pos: Record<string, LabFloatRect>,
      side: "left" | "right",
      excludeId: string,
    ): Record<string, LabFloatRect> => {
      const column = order
        .filter(other => {
          const r = pos[other]
          return other !== excludeId && !!r && isSideDocked(r, side)
        })
        .sort((a, b) => (pos[a]?.y ?? 0) - (pos[b]?.y ?? 0))
      return layoutColumn(pos, column, side)
    }
    const rebalanceBothSides = (
      pos: Record<string, LabFloatRect>,
    ): Record<string, LabFloatRect> =>
      rebalance(rebalance(pos, "left", id), "right", id)

    // Dock the dragged panel to a side, sharing that side's well as an even
    // vertical split with any panels already docked there (so a second panel
    // divides the well instead of sitting on top of the first).
    const dockSide = (
      side: "left" | "right",
      ids: readonly string[],
      dropY: number,
    ) => {
      setFloatPos(prev => {
        const idSet = new Set(ids)
        const existing = order.filter(other => {
          const r = prev[other]
          return !idSet.has(other) && !!r && isSideDocked(r, side)
        })
        const anchor = tailBase[id]?.y ?? 0
        // Keep the dragged group contiguous at the drop point, interleaved with
        // any already-docked panels by position.
        const yKey = (other: string) => {
          if (other === id) return dropY
          if (idSet.has(other))
            return dropY + ((tailBase[other]?.y ?? 0) - anchor)
          return prev[other]?.y ?? 0
        }
        const column = [...existing, ...ids].sort((a, b) => yKey(a) - yKey(b))
        const next = layoutColumn(prev, column, side)
        // The opposite column re-expands if this group just left it.
        return rebalance(next, side === "left" ? "right" : "left", id)
      })
    }
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
    const move = (next: PointerEvent) => {
      const rawX = clamp(
        base.x + next.clientX - startX,
        0,
        window.innerWidth - 60,
      )
      const rawY = clamp(
        base.y + next.clientY - startY,
        barH,
        window.innerHeight - 30,
      )
      // Drag into a side edge -> dock the panel on that side (splitting the
      // column with any panels already docked there).
      if (rawX <= EDGE_DOCK) {
        dockSide("left", tail, rawY)
        return
      }
      if (rawX + self.width >= window.innerWidth - EDGE_DOCK) {
        dockSide("right", tail, rawY)
        return
      }
      const aligned = snapToNeighbors(
        { x: rawX, y: rawY, width: self.width, height: self.height },
        neighbors,
        SNAP,
      )
      const joined = aligned.x !== rawX || aligned.y !== rawY
      const x = joined ? aligned.x : snapLeading(rawX, self.width, xLines)
      const y = joined ? aligned.y : snapLeading(rawY, self.height, yLines)
      const dx = x - base.x
      const dy = y - base.y
      setFloatPos(prev => {
        const next = { ...prev }
        next[id] = joined
          ? { x, y, width: aligned.width, height: aligned.height }
          : { x, y, width: base.width, height: base.height }
        // Carry the panels stacked below the grabbed one rigidly.
        for (const m of tail) {
          if (m === id) continue
          const b = tailBase[m]
          if (b) next[m] = { ...b, x: b.x + dx, y: b.y + dy }
        }
        return rebalanceBothSides(next)
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

  const startFloatResize = (id: string) => (event: React.PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return
    event.stopPropagation()
    setResizeId(id)
    const startX = event.clientX
    const startY = event.clientY
    const base = floatPos[id] ?? DEFAULT_RECT
    const self = liveRect(id)
    const barH = hostRef.current?.getBoundingClientRect().top ?? 0
    // Group members reflow with this resize, so they are not snap targets and
    // are excluded from the magnet lines.
    const members = memberMap.get(id)
    const groupIds = members && members.length > 1 ? members : null
    const baseLive: Record<string, Rect> = {}
    if (groupIds) for (const m of groupIds) baseLive[m] = liveRect(m)
    // A side-docked panel reflows its well column (gapped, so it is not an
    // adjacency group): the resized panel keeps its new size and the rest of
    // the column re-stacks within the well.
    const dockedSide: "left" | "right" | null = isSideDocked(self, "left")
      ? "left"
      : isSideDocked(self, "right")
        ? "right"
        : null
    const wellIds = dockedSide
      ? order
          .filter(other => {
            const r = floatPos[other]
            return !!r && isSideDocked(r, dockedSide)
          })
          .sort((a, b) => liveRect(a).y - liveRect(b).y)
      : null
    const wellBase: Record<string, Rect> = {}
    if (wellIds) for (const m of wellIds) wellBase[m] = liveRect(m)
    const neighbors = order
      .filter(other => other !== id && !(groupIds?.includes(other) ?? false))
      .map(other => liveRect(other))
    // Horizontal docking disabled: only the viewport sides snap on X.
    const xLines = [0, window.innerWidth]
    const yLines = [
      barH,
      window.innerHeight,
      ...neighbors.flatMap(n => [n.y, n.y + n.height]),
    ]
    const baseW = base.width
    const baseH = base.height ?? self.height
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
    const move = (next: PointerEvent) => {
      const maxH = window.innerHeight - base.y - 12
      const rawRight =
        base.x + clamp(baseW + next.clientX - startX, FLOAT_MIN_W, FLOAT_MAX_W)
      const rawBottom =
        base.y + clamp(baseH + next.clientY - startY, PANEL_MIN_H, maxH)
      const width = clamp(
        snapSingleEdge(rawRight, xLines) - base.x,
        FLOAT_MIN_W,
        FLOAT_MAX_W,
      )
      const height = clamp(
        snapSingleEdge(rawBottom, yLines) - base.y,
        PANEL_MIN_H,
        maxH,
      )
      if (dockedSide && wellIds) {
        setFloatPos(prev => {
          const out = { ...prev }
          let cursor = barH + WELL_PAD
          for (const mid of wellIds) {
            const h =
              mid === id ? height : (wellBase[mid]?.height ?? PANEL_MIN_H)
            out[mid] = {
              x:
                dockedSide === "left"
                  ? WELL_PAD
                  : window.innerWidth - WELL_PAD - width,
              y: cursor,
              width,
              height: h,
            }
            cursor += h + WELL_GAP
          }
          return out
        })
        return
      }
      const resized: Rect = { x: base.x, y: base.y, width, height }
      const reflowed = groupIds
        ? reflowStack(baseLive, groupIds, id, resized)
        : null
      if (reflowed) {
        setFloatPos(prev => ({ ...prev, ...reflowed }))
        return
      }
      setFloatPos(prev => ({
        ...prev,
        [id]: { ...(prev[id] ?? base), width, height },
      }))
    }
    const up = () => {
      setResizeId(null)
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  return (
    <LayoutGroup>
      {dock ? (
        <button
          type="button"
          className={`pt-dock-resize${resizing ? " is-resizing" : ""}`}
          aria-label="Resize panel rail"
          onPointerDown={startResize}
        />
      ) : null}
      <div ref={hostRef} className={dock ? "pt-dock-right" : "pt-float-host"}>
        {!dock
          ? (["left", "right"] as const).map(side => {
              const members = order.filter(other => {
                const r = floatPos[other]
                return !!r && isSideDocked(r, side)
              })
              if (members.length === 0) return null
              const wellWidth =
                Math.max(...members.map(other => floatPos[other]?.width ?? 0)) +
                2 * WELL_PAD
              return (
                <div
                  key={`well-${side}`}
                  className={`pt-side-well pt-side-well-${side}`}
                  aria-hidden
                  style={{ width: wellWidth }}
                />
              )
            })
          : null}
        {!dock
          ? groups
              .filter(group => group.length > 1)
              .map(group => {
                const bbox = unionBBox(group.map(id => liveRect(id)))
                return (
                  <div
                    key={`group-${group.join("-")}`}
                    className="pt-panel-group"
                    aria-hidden
                    style={{
                      position: "fixed",
                      left: bbox.x,
                      top: bbox.y,
                      width: bbox.width,
                      height: bbox.height,
                    }}
                  />
                )
              })
          : null}
        {order.map(id => {
          const panel = byId.get(id)
          if (!panel) return null
          const rect = floatPos[id] ?? DEFAULT_RECT
          const open = !collapsed[id]
          const busy = dragId === id || resizeId === id
          const sized = !dock && rect.height != null
          const animate = !interacting
          const members = memberMap.get(id)
          const grouped = !dock && !!members && members.length > 1
          const style: CSSProperties = dock
            ? { width: "100%" }
            : {
                position: "fixed",
                left: rect.x,
                top: rect.y,
                width: rect.width,
                height: rect.height,
              }
          const bodyStyle: CSSProperties | undefined =
            dock && dockHeights[id] != null
              ? { height: dockHeights[id], maxHeight: dockHeights[id] }
              : undefined
          // Header drag always moves the single panel: a panel that is part of
          // a stack pulls cleanly out of it (undock) instead of dragging the
          // whole group.
          const onHeaderPointerDown = dock
            ? startDockReorder(id)
            : startSingleMove(id)
          return (
            <motion.section
              key={id}
              layout={!dock && animate ? "position" : false}
              transition={transition}
              data-dock-id={id}
              className={`pt-panel${dock ? " is-docked" : ""}${sized ? " is-sized" : ""}${grouped ? " is-grouped" : ""}${busy ? " is-dragging" : ""}`}
              style={style}
              aria-label={panel.title}
            >
              <header
                className="pt-panel-bar"
                onPointerDown={onHeaderPointerDown}
              >
                <span
                  className="pt-panel-dot"
                  style={{ background: panel.accent }}
                />
                <span className="pt-panel-title">{panel.title}</span>
                {panel.action ? (
                  <div
                    className="pt-panel-actions"
                    onPointerDown={event => event.stopPropagation()}
                  >
                    {panel.action}
                  </div>
                ) : null}
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
                <div className="pt-panel-body" style={bodyStyle}>
                  {panel.render()}
                </div>
              ) : null}
              {open && dock ? (
                <button
                  type="button"
                  className="pt-panel-resize-y"
                  aria-label={`Resize ${panel.title} height`}
                  onPointerDown={startDockHeightResize(id)}
                />
              ) : null}
              {open && !dock ? (
                <button
                  type="button"
                  className="pt-panel-resize"
                  aria-label={`Resize ${panel.title}`}
                  onPointerDown={startFloatResize(id)}
                />
              ) : null}
            </motion.section>
          )
        })}
      </div>
    </LayoutGroup>
  )
}
