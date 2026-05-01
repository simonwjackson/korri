import type { InputAdapter } from "./types"

/**
 * Pointer adapter: translates mouse / pointer device events into bus actions.
 *
 *   pointermove  → emit "pointer-activity" + .focus() the deepest focusable
 *                  under the cursor (skipping focus when the active element
 *                  is editable).
 *   contextmenu  → emit "options" if the cursor is on a focusable, and
 *                  preventDefault the native menu. Pass through otherwise.
 *
 * Touch-derived pointer events (and pen) are ignored entirely so a tap on a
 * touchscreen does not enter pointer mode and does not re-show a cursor that
 * has no physical presence on the device. A future touch adapter handles
 * touch on its own terms.
 *
 * Sub-pixel cursor jitter is gated by `movementThresholdPx` so the adapter
 * does not re-emit and re-focus on every pointermove fired by the OS.
 */

export interface PointerAdapterOptions {
  /** Where to attach the listeners. Defaults to window. */
  readonly target?: EventTarget
  /**
   * Minimum cumulative pixel delta from the last emit before another
   * pointer-activity / hover-focus pass runs. Default 1. Increase if a noisy
   * device (palm jitter, trackpad inertia) re-flips mode without intent.
   */
  readonly movementThresholdPx?: number
  /**
   * When the focused element is editable, skip the focus() call but still
   * emit pointer-activity. Default true. Mirrors keyboard-adapter's
   * `ignoreWhenEditable` discipline.
   */
  readonly preserveEditableFocus?: boolean
}

const FOCUSABLE_SELECTOR =
  "a, button, input, select, textarea, [tabindex]:not([tabindex='-1'])"

interface PointerEventLike {
  readonly target: EventTarget | null
  readonly pointerType?: string
  readonly clientX?: number
  readonly clientY?: number
}

export function createPointerAdapter(
  options: PointerAdapterOptions = {},
): InputAdapter {
  const target =
    options.target ?? (typeof window !== "undefined" ? window : null)
  const threshold = options.movementThresholdPx ?? 1
  const preserveEditable = options.preserveEditableFocus ?? true

  return {
    name: "pointer",
    start(emit) {
      if (!target) return () => {}

      let lastClientX: number | null = null
      let lastClientY: number | null = null

      const onPointerMove = (rawEvent: Event) => {
        const event = rawEvent as unknown as PointerEventLike
        const pointerType = event.pointerType
        // PointerEvent fires for mouse / touch / pen. Mouse events without a
        // pointerType (older browsers / synthetic events) are treated as mouse.
        if (pointerType === "touch" || pointerType === "pen") return

        const clientX = event.clientX ?? 0
        const clientY = event.clientY ?? 0
        if (lastClientX !== null && lastClientY !== null) {
          const dx = clientX - lastClientX
          const dy = clientY - lastClientY
          if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return
        }
        lastClientX = clientX
        lastClientY = clientY

        emit({ type: "pointer-activity", source: "pointer" })

        if (preserveEditable && isEditableElement(document.activeElement))
          return

        const focusable = findFocusable(event.target)
        if (!focusable) return
        if (focusable === document.activeElement) return

        focusable.focus({ preventScroll: true })
      }

      const onContextMenu = (rawEvent: Event) => {
        const event = rawEvent as unknown as PointerEventLike & Event
        const focusable = findFocusable(event.target)
        if (!focusable) return
        ;(event as Event).preventDefault()
        emit({ type: "options", source: "pointer" })
      }

      target.addEventListener("pointermove", onPointerMove)
      target.addEventListener("contextmenu", onContextMenu)

      return () => {
        target.removeEventListener("pointermove", onPointerMove)
        target.removeEventListener("contextmenu", onContextMenu)
      }
    },
  }
}

function findFocusable(eventTarget: EventTarget | null): HTMLElement | null {
  if (!eventTarget) return null
  if (!(eventTarget instanceof Element)) return null
  return eventTarget.closest<HTMLElement>(FOCUSABLE_SELECTOR)
}

function isEditableElement(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
  return (el as HTMLElement).isContentEditable === true
}
