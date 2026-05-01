/**
 * Mario-camera scroll centering for opt-in scrollable ancestors.
 *
 * Walks up from `target` collecting ancestors that carry `data-mario-camera`,
 * then for each one drives `scrollLeft` / `scrollTop` so the target's center
 * aligns with the surface's center on the surface's declared axis.
 *
 * Snap or animate:
 *   - `animate: false`, OR `prefers-reduced-motion: reduce` → set scroll
 *     positions synchronously (R12, R13).
 *   - `animate: true` (default) → drive a single shared rAF loop that
 *     advances every in-flight tween in the same tick (R10, R11). A new call
 *     for a surface that already has a tween in flight cancels the previous
 *     tween and starts a new one from the current scroll position, so held
 *     direction input doesn't restart from origin.
 *
 * The util is engine-gated: the focus engine calls it from the directional
 * branch only. Pointer hover deliberately bypasses the engine and so does
 * NOT trigger Mario centering — see Key Technical Decisions in the plan
 * (`docs/plans/2026-05-01-002-feat-tilegrid-mario-camera-plan.md`) and the
 * coexistence section of the spatial-nav best-practice for the rationale.
 */

/** Target animation duration in ms. Snappy by design. */
export const MARIO_CAMERA_DURATION_MS = 150

/** Cubic ease-out: rapid initial movement, gentle settle. */
export function easeOutCubic(t: number): number {
  const clamped = t <= 0 ? 0 : t >= 1 ? 1 : t
  const inv = 1 - clamped
  return 1 - inv * inv * inv
}

const ATTRIBUTE = "data-mario-camera"

type CameraAxis = "inline" | "block" | "both"

export interface CenterScrollOptions {
  /** Animate via rAF tween (default true). When false, scroll is set synchronously. */
  readonly animate?: boolean
  /** Schedule a frame. Defaults to `requestAnimationFrame`. */
  readonly schedule?: (cb: FrameRequestCallback) => number
  /** Cancel a scheduled frame. Defaults to `cancelAnimationFrame`. */
  readonly cancel?: (handle: number) => void
  /** Now-clock. Defaults to `performance.now`. */
  readonly now?: () => number
  /** Reduced-motion check. Defaults to `matchMedia("(prefers-reduced-motion: reduce)").matches`. */
  readonly prefersReducedMotion?: () => boolean
  /** Animation duration in ms. Defaults to {@link MARIO_CAMERA_DURATION_MS}. */
  readonly durationMs?: number
}

interface Tween {
  readonly element: Element
  readonly startLeft: number
  readonly startTop: number
  readonly targetLeft: number
  readonly targetTop: number
  readonly axisLeft: boolean
  readonly axisTop: boolean
  readonly startTime: number
  readonly durationMs: number
  readonly now: () => number
}

// Module-private state. One tween per surface; new calls replace prior tweens.
const activeTweens = new Map<Element, Tween>()
let rafHandle: number | null = null
let rafSchedule:
  | ((cb: FrameRequestCallback) => number)
  | null = null
let rafCancel: ((handle: number) => void) | null = null

/**
 * Returns true when `target` has any ancestor carrying `data-mario-camera`
 * with a recognized axis value. Used by the focus engine to branch on whether
 * to call {@link centerScrollableAncestors} or fall back to `scrollIntoView`.
 */
export function hasMarioCameraAncestor(target: HTMLElement): boolean {
  let node: Element | null = target.parentElement
  while (node && node !== document.documentElement) {
    if (parseAxis(node.getAttribute(ATTRIBUTE)) !== null) return true
    node = node.parentElement
  }
  return false
}

/**
 * Center every Mario-camera ancestor of `target` so the target sits at the
 * surface's center on the surface's declared axis (or axes).
 *
 * No-op when:
 *   - There are no `data-mario-camera` ancestors.
 *   - All Mario ancestors are not actually overflowing on their declared axis
 *     (defense-in-depth for R3 — non-overflowing tilegrids do not scroll).
 */
export function centerScrollableAncestors(
  target: HTMLElement,
  options: CenterScrollOptions = {},
): void {
  const animate = options.animate ?? true
  const schedule =
    options.schedule ??
    ((cb: FrameRequestCallback) => requestAnimationFrame(cb))
  const cancel =
    options.cancel ?? ((handle: number) => cancelAnimationFrame(handle))
  const now =
    options.now ??
    (() => (typeof performance !== "undefined" ? performance.now() : Date.now()))
  const prefersReducedMotion =
    options.prefersReducedMotion ??
    (() => {
      if (typeof window === "undefined" || !window.matchMedia) return false
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    })
  const durationMs = options.durationMs ?? MARIO_CAMERA_DURATION_MS

  const surfaces = collectMarioAncestors(target)
  if (surfaces.length === 0) return

  const reduced = prefersReducedMotion()
  const snap = !animate || reduced

  for (const { element, axis } of surfaces) {
    const targetRect = target.getBoundingClientRect()
    const surfaceRect = element.getBoundingClientRect()

    const axisInline = axis === "inline" || axis === "both"
    const axisBlock = axis === "block" || axis === "both"

    let targetLeft = element.scrollLeft
    let targetTop = element.scrollTop
    let willMoveLeft = false
    let willMoveTop = false

    if (axisInline && element.scrollWidth > element.clientWidth) {
      const tileCenterX = targetRect.left + targetRect.width / 2
      const surfaceCenterX = surfaceRect.left + surfaceRect.width / 2
      const desired = element.scrollLeft + (tileCenterX - surfaceCenterX)
      const max = element.scrollWidth - element.clientWidth
      targetLeft = clamp(desired, 0, max)
      willMoveLeft = true
    }

    if (axisBlock && element.scrollHeight > element.clientHeight) {
      const tileCenterY = targetRect.top + targetRect.height / 2
      const surfaceCenterY = surfaceRect.top + surfaceRect.height / 2
      const desired = element.scrollTop + (tileCenterY - surfaceCenterY)
      const max = element.scrollHeight - element.clientHeight
      targetTop = clamp(desired, 0, max)
      willMoveTop = true
    }

    // R3 defense-in-depth: ancestor declares the axis but isn't overflowing,
    // or ancestor is overflowing but neither axis was selected. No-op.
    if (!willMoveLeft && !willMoveTop) {
      // Drop any in-flight tween for this surface so it doesn't keep moving.
      activeTweens.delete(element)
      continue
    }

    if (snap) {
      activeTweens.delete(element)
      if (willMoveLeft) element.scrollLeft = targetLeft
      if (willMoveTop) element.scrollTop = targetTop
      continue
    }

    activeTweens.set(element, {
      element,
      startLeft: element.scrollLeft,
      startTop: element.scrollTop,
      targetLeft,
      targetTop,
      axisLeft: willMoveLeft,
      axisTop: willMoveTop,
      startTime: now(),
      durationMs,
      now,
    })
  }

  if (activeTweens.size === 0) {
    if (rafHandle !== null && rafCancel) {
      rafCancel(rafHandle)
      rafHandle = null
      rafCancel = null
    }
    return
  }

  // Always re-arm with the most recent caller's clock so tests injecting a
  // fake scheduler stay deterministic across re-schedules.
  rafSchedule = schedule
  rafCancel = cancel
  if (rafHandle === null) {
    rafHandle = schedule(tick)
  }
}

function tick(): void {
  // The rAF API passes its own timestamp, but each tween carries its own
  // `now` injection so tests can drive the clock without monkey-patching
  // performance.now. Read each tween's clock.
  rafHandle = null

  for (const [element, tween] of [...activeTweens]) {
    const elapsed = tween.now() - tween.startTime
    const progress = tween.durationMs <= 0 ? 1 : elapsed / tween.durationMs

    if (progress >= 1) {
      if (tween.axisLeft) element.scrollLeft = tween.targetLeft
      if (tween.axisTop) element.scrollTop = tween.targetTop
      activeTweens.delete(element)
      continue
    }

    const eased = easeOutCubic(progress)
    if (tween.axisLeft) {
      element.scrollLeft =
        tween.startLeft + (tween.targetLeft - tween.startLeft) * eased
    }
    if (tween.axisTop) {
      element.scrollTop =
        tween.startTop + (tween.targetTop - tween.startTop) * eased
    }
  }

  if (activeTweens.size > 0 && rafSchedule) {
    // Re-arm with the most recently captured scheduler so injected fake
    // clocks (in tests) stay deterministic across frame boundaries.
    rafHandle = rafSchedule(tick)
  } else {
    rafSchedule = null
    rafCancel = null
  }
}

interface MarioSurface {
  readonly element: Element
  readonly axis: CameraAxis
}

function collectMarioAncestors(target: HTMLElement): MarioSurface[] {
  const surfaces: MarioSurface[] = []
  let node: Element | null = target.parentElement
  while (node && node !== document.documentElement) {
    const raw = node.getAttribute(ATTRIBUTE)
    const axis = parseAxis(raw)
    if (axis !== null) surfaces.push({ element: node, axis })
    node = node.parentElement
  }
  return surfaces
}

function parseAxis(value: string | null): CameraAxis | null {
  if (value === "inline" || value === "block" || value === "both") return value
  return null
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  if (value < min) return min
  if (value > max) return max
  return value
}

/**
 * Test-only: clear in-flight tweens and any scheduled rAF. Production code
 * should never need this — tweens self-clean when they complete.
 */
export function __resetCenterScrollState(): void {
  if (rafHandle !== null && rafCancel) rafCancel(rafHandle)
  rafHandle = null
  rafSchedule = null
  rafCancel = null
  activeTweens.clear()
}
