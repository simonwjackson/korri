import type { Direction, InputAdapter } from "./types"

/**
 * Wheel adapter: opt-in wheel-as-direction.
 *
 * Inside a container marked with `data-pointer-wheel="vertical" |
 * "horizontal" | "2d"`, wheel events are translated into "direction" bus
 * actions (with `source: "wheel"`) and the native page scroll is
 * preventDefaulted.
 *
 *   "vertical"   - deltaY → up/down. Ignores deltaX.
 *   "horizontal" - deltaY OR deltaX → left/right. Common on horizontal rails
 *                  where users expect vertical wheel motion to scroll the
 *                  rail sideways.
 *   "2d"         - dominant axis per event drives the direction.
 *
 * Outside opted-in containers, the adapter does nothing — native scroll is
 * preserved.
 *
 * Sub-threshold deltas accumulate across events so trackpad streams
 * (continuous small deltaY values) emit one tile-step per natural gesture
 * rather than skipping multiple tiles. Large single events (classic mouse
 * wheel "click" of ±100, or a fast roll) emit one or more directions in the
 * same callback.
 */

export interface WheelAdapterOptions {
  /** Where to attach the listener. Defaults to window. */
  readonly target?: EventTarget
  /**
   * Accumulated absolute delta required to emit one direction. Default 80
   * (slightly under one classic mouse-wheel "click" of 100). Tune up if a
   * trackpad inertial flick over-emits, tune down if a slow wheel feels
   * unresponsive.
   */
  readonly deltaThreshold?: number
}

type WheelAxis = "vertical" | "horizontal" | "2d"

interface WheelEventLike {
  readonly target: EventTarget | null
  readonly deltaX?: number
  readonly deltaY?: number
}

const ATTRIBUTE = "data-pointer-wheel"

export function createWheelAdapter(
  options: WheelAdapterOptions = {},
): InputAdapter {
  const target =
    options.target ?? (typeof window !== "undefined" ? window : null)
  const threshold = options.deltaThreshold ?? 80

  return {
    name: "wheel",
    start(emit) {
      if (!target) return () => {}

      // One accumulator pair per container element. Map keyed by the
      // container element itself so leaving and re-entering does not bleed
      // across containers.
      const accumulators = new WeakMap<
        Element,
        { x: number; y: number }
      >()

      const handler = (rawEvent: Event) => {
        const event = rawEvent as unknown as WheelEventLike & Event
        const container = findOptedInContainer(event.target)
        if (!container) return

        const axis = parseAxis(container.getAttribute(ATTRIBUTE))
        const deltaX = event.deltaX ?? 0
        const deltaY = event.deltaY ?? 0

        if (axis === "vertical" && deltaX !== 0 && deltaY === 0) {
          // Vertical-only container: a horizontal-only swipe is not consumed.
          // Native horizontal scroll on the parent (if any) proceeds.
          return
        }

        ;(event as Event).preventDefault()

        const acc = accumulators.get(container) ?? { x: 0, y: 0 }
        acc.x += deltaX
        acc.y += deltaY

        // Per-axis emission loop. For "vertical" and "horizontal", only one
        // axis is active and the other is zeroed below. For "2d", both axes
        // can emit independently in the same event.
        const directions: Direction[] = []
        if (axis === "vertical") {
          while (Math.abs(acc.y) >= threshold) {
            directions.push(acc.y > 0 ? "down" : "up")
            acc.y += acc.y > 0 ? -threshold : threshold
          }
          acc.x = 0
        } else if (axis === "horizontal") {
          // Vertical wheel motion (deltaY) maps to horizontal direction on a
          // horizontal rail — desktop carousel convention.
          const projected = acc.y !== 0 ? acc.y : acc.x
          let remaining = projected
          while (Math.abs(remaining) >= threshold) {
            directions.push(remaining > 0 ? "right" : "left")
            remaining += remaining > 0 ? -threshold : threshold
          }
          // Carry residual back into x, since we projected y into x for the
          // axis flip; reset y so it doesn't double-count next event.
          acc.x = remaining
          acc.y = 0
        } else {
          // 2d: cross-axis emission. Dominant axis per event isn't strictly
          // required because both can emit, but emit y first then x for
          // deterministic ordering.
          while (Math.abs(acc.y) >= threshold) {
            directions.push(acc.y > 0 ? "down" : "up")
            acc.y += acc.y > 0 ? -threshold : threshold
          }
          while (Math.abs(acc.x) >= threshold) {
            directions.push(acc.x > 0 ? "right" : "left")
            acc.x += acc.x > 0 ? -threshold : threshold
          }
        }

        accumulators.set(container, acc)

        for (const direction of directions) {
          emit({ type: "direction", direction, source: "wheel" })
        }
      }

      // passive:false because we may call preventDefault inside opted-in
      // containers.
      target.addEventListener("wheel", handler, { passive: false })

      return () => {
        target.removeEventListener("wheel", handler)
      }
    },
  }
}

function findOptedInContainer(eventTarget: EventTarget | null): Element | null {
  if (!eventTarget) return null
  if (!(eventTarget instanceof Element)) return null
  return eventTarget.closest(`[${ATTRIBUTE}]`)
}

function parseAxis(value: string | null): WheelAxis {
  if (value === "vertical") return "vertical"
  if (value === "horizontal") return "horizontal"
  // "2d", unknown values, and missing values fall back to "2d" — fail open
  // to a working mapping rather than silently dropping wheel input.
  return "2d"
}
