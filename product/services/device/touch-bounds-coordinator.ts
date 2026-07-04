import type {
  StreamControlSession,
  StreamControlTouchBounds,
} from "@platform/stream-control/stream-control-session"
import type { CurrentStreamSurfaceGeometry } from "./game-stream-fullscreen"
import {
  type ContentModeFacts,
  computeTouchBoundsFromGeometry,
  type TouchAbsRange,
  type TouchBounds,
  type TouchBoundsScalingPolicy,
} from "./touch-bounds-geometry"

export interface TouchBoundsCoordinatorFailure {
  readonly reason:
    | "missing-capability"
    | "absolute-touch-disabled"
    | "missing-calibration"
    | "missing-surface"
    | "missing-geometry"
    | "invalid-geometry"
    | "apply-failed"
  readonly message?: string
}

export interface TouchBoundsCoordinatorHandle {
  readonly tick: (reason?: string) => Promise<void>
  readonly close: () => Promise<void>
  readonly lastAppliedBounds: () => TouchBounds | undefined
  readonly lastFailure: () => TouchBoundsCoordinatorFailure | undefined
}

/**
 * Local structural views of the control session's opaque hello/state responses.
 * The coordinator reads only capability + calibration fields, so it needs no
 * streamer-module import (keeps the plugin removable).
 */
interface ControlHelloView {
  readonly result?: {
    readonly _tag?: string
    readonly capabilities?: { readonly commands?: readonly string[] }
  }
}

interface ControlStateView {
  readonly result?: {
    readonly _tag?: string
    readonly input?: {
      readonly absoluteTouch?: {
        readonly enabled?: boolean
        readonly absRange?: TouchAbsRange
      }
    }
  }
}

export interface TouchBoundsCoordinatorOptions {
  readonly moonlight: StreamControlSession
  readonly readGeometry: () => Promise<CurrentStreamSurfaceGeometry>
  readonly readContentMode?: () => Promise<ContentModeFacts | undefined>
  readonly scalingPolicy?: TouchBoundsScalingPolicy
  readonly pollMs?: number | false
  readonly setInterval?: typeof globalThis.setInterval
  readonly clearInterval?: typeof globalThis.clearInterval
}

export async function startTouchBoundsCoordinator(
  options: TouchBoundsCoordinatorOptions,
): Promise<TouchBoundsCoordinatorHandle> {
  let closed = false
  let calibration: TouchAbsRange | undefined
  let lastApplied: TouchBounds | undefined
  let lastFailure: TouchBoundsCoordinatorFailure | undefined
  let interval: ReturnType<typeof setInterval> | undefined

  const handle: TouchBoundsCoordinatorHandle = {
    tick,
    close: async () => {
      closed = true
      if (interval) {
        ;(options.clearInterval ?? globalThis.clearInterval)(interval)
      }
    },
    lastAppliedBounds: () => lastApplied,
    lastFailure: () => lastFailure,
  }

  await initialize()
  await tick("initial")

  if (options.pollMs !== false) {
    interval = (options.setInterval ?? globalThis.setInterval)(() => {
      void tick("poll")
    }, options.pollMs ?? 100)
  }

  return handle

  async function initialize(): Promise<void> {
    const hello = (await options.moonlight.hello()) as ControlHelloView
    if (hello.result?._tag !== "protocol.hello") {
      lastFailure = { reason: "missing-capability", message: "hello failed" }
      return
    }
    if (
      !hello.result.capabilities?.commands?.includes("input.setTouchBounds")
    ) {
      lastFailure = { reason: "missing-capability" }
      return
    }

    const state = (await options.moonlight.state()) as ControlStateView
    if (state.result?._tag !== "state.snapshot") {
      lastFailure = { reason: "missing-calibration", message: "state failed" }
      return
    }
    const absoluteTouch = state.result.input?.absoluteTouch
    if (!absoluteTouch?.enabled) {
      lastFailure = { reason: "absolute-touch-disabled" }
      return
    }
    calibration = absoluteTouch.absRange
    if (!calibration) {
      lastFailure = { reason: "missing-calibration" }
    }
  }

  async function tick(_reason = "manual"): Promise<void> {
    if (closed) return
    if (!calibration) return

    const bounds = await readCurrentBounds(calibration)
    if (!bounds) return
    if (sameBounds(lastApplied, bounds)) return

    await applyBounds(bounds)
  }

  async function readCurrentBounds(
    absRange: TouchAbsRange,
  ): Promise<TouchBounds | undefined> {
    const geometry = await options.readGeometry()
    if (geometry.status !== "available") {
      lastFailure = { reason: geometry.status }
      return undefined
    }

    const contentMode = await options.readContentMode?.()
    const computed = computeTouchBoundsFromGeometry({
      outputRect: geometry.surface.output.rect,
      surfaceRect: geometry.surface.rect,
      absRange,
      scalingPolicy: options.scalingPolicy ?? { _tag: "stretchFill" },
      contentMode,
    })
    if (computed.status !== "valid") {
      lastFailure = { reason: "invalid-geometry", message: computed.reason }
      return undefined
    }
    return computed.bounds
  }

  async function applyBounds(bounds: TouchBounds): Promise<void> {
    try {
      await options.moonlight.setTouchBounds(toMoonlightBounds(bounds))
      lastApplied = bounds
      lastFailure = undefined
    } catch (error) {
      lastFailure = {
        reason: "apply-failed",
        message: error instanceof Error ? error.message : String(error),
      }
    }
  }
}

function sameBounds(a: TouchBounds | undefined, b: TouchBounds): boolean {
  return !!a && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
}

function toMoonlightBounds(bounds: TouchBounds): StreamControlTouchBounds {
  return { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h }
}
