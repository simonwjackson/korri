/**
 * Directional focus movement — the host half of "surfaces are focus-driven".
 *
 * A surface renders native focusable controls and reacts to focus; deciding
 * which control a press moves to is the host's job, because only the host knows
 * which devices exist and how they map. This adapter turns semantic directions
 * into real DOM focus and a semantic confirm into a real click on the focused
 * control, so a surface never handles a key, a button index, or a coordinate.
 *
 * Selection is geometric, not DOM-order: the nearest candidate in the pressed
 * direction wins, with distance along that axis dominating so a long rail does
 * not jump to a nearer element on another row.
 */
import type { InputBus } from "./bus"
import type { Direction } from "./types"

const FOCUSABLE_SELECTOR =
  "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"

/** Off-axis distance is penalised so movement stays in the pressed direction. */
const OFF_AXIS_PENALTY = 3

function isVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function center(element: Element): { x: number; y: number } {
  const rect = element.getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

/**
 * A focus trap: when the focused element sits inside a container marked
 * `data-block-exit` (Shift's sheet), candidates outside it are ignored so
 * directional input cannot wander onto the surface behind an open panel.
 */
function scopeFor(active: Element | null): ParentNode {
  const blocked = active?.closest("[data-block-exit]")
  return blocked ?? document
}

export function focusInDirection(direction: Direction): boolean {
  const active =
    document.activeElement instanceof HTMLElement &&
    document.activeElement !== document.body
      ? document.activeElement
      : null

  const scope = scopeFor(active)
  const candidates = Array.from(
    scope.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(element => element !== active && isVisible(element))
  if (candidates.length === 0) return false

  // No current focus: start at the first candidate rather than guessing.
  if (!active) {
    candidates[0]?.focus({ preventScroll: true })
    return true
  }

  const from = center(active)
  let best: { element: HTMLElement; score: number } | null = null

  for (const candidate of candidates) {
    const to = center(candidate)
    const dx = to.x - from.x
    const dy = to.y - from.y
    const along =
      direction === "left" ? -dx
      : direction === "right" ? dx
      : direction === "up" ? -dy
      : dy
    // Must actually lie in the pressed direction. The epsilon keeps elements
    // that merely share an edge from counting as "ahead".
    if (along <= 1) continue
    const across =
      direction === "left" || direction === "right"
        ? Math.abs(dy)
        : Math.abs(dx)
    const score = along + across * OFF_AXIS_PENALTY
    if (!best || score < best.score) best = { element: candidate, score }
  }

  if (!best) return false
  best.element.focus({ preventScroll: true })
  return true
}

/**
 * Wire directional movement and confirm to the focused control. Returns a
 * disposer. Confirm clicks rather than dispatching a synthetic key so a plain
 * `<button>` in any surface responds without extra wiring.
 */
export function createSpatialFocusController(bus: InputBus): () => void {
  const offDirection = bus.onAction("direction", action => {
    focusInDirection(action.direction)
  })
  const offConfirm = bus.onAction("confirm", () => {
    const active = document.activeElement
    if (active instanceof HTMLElement && active !== document.body) {
      active.click()
    }
  })
  return () => {
    offDirection()
    offConfirm()
  }
}
