import type { SwayRect } from "./sessiond-sway"

export interface TouchAbsRange {
  readonly minX: number
  readonly maxX: number
  readonly minY: number
  readonly maxY: number
}

export interface TouchBounds {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

export interface GamescopeModeFacts {
  readonly width: number
  readonly height: number
}

export type TouchBoundsScalingPolicy =
  | { readonly _tag: "stretchFill" }
  | { readonly _tag: "fitLetterbox" }
  | { readonly _tag: "unknown" }

export type TouchBoundsGeometryResult =
  | { readonly status: "valid"; readonly bounds: TouchBounds }
  | { readonly status: "invalid"; readonly reason: string }

export interface TouchBoundsGeometryInput {
  readonly outputRect: SwayRect
  readonly surfaceRect: SwayRect
  readonly absRange: TouchAbsRange
  readonly scalingPolicy: TouchBoundsScalingPolicy
  readonly gamescopeMode?: GamescopeModeFacts
}

export function computeTouchBoundsFromGeometry(
  input: TouchBoundsGeometryInput,
): TouchBoundsGeometryResult {
  if (!validRect(input.outputRect)) {
    return { status: "invalid", reason: "invalid-output-rect" }
  }
  if (!validRect(input.surfaceRect)) {
    return { status: "invalid", reason: "invalid-surface-rect" }
  }
  if (!validAbsRange(input.absRange)) {
    return { status: "invalid", reason: "invalid-abs-range" }
  }

  const activeSurface = activeGameSurface(input)
  if (!activeSurface) {
    return { status: "invalid", reason: "unknown-scaling-policy" }
  }

  const clipped = intersectRects(activeSurface, input.outputRect)
  if (!clipped || clipped.width <= 0 || clipped.height <= 0) {
    return { status: "invalid", reason: "surface-outside-output" }
  }

  const absWidth = input.absRange.maxX - input.absRange.minX + 1
  const absHeight = input.absRange.maxY - input.absRange.minY + 1
  const x =
    input.absRange.minX +
    Math.round(
      ((clipped.x - input.outputRect.x) / input.outputRect.width) * absWidth,
    )
  const y =
    input.absRange.minY +
    Math.round(
      ((clipped.y - input.outputRect.y) / input.outputRect.height) * absHeight,
    )
  const w = Math.round((clipped.width / input.outputRect.width) * absWidth)
  const h = Math.round((clipped.height / input.outputRect.height) * absHeight)

  const bounds = {
    x: clamp(x, input.absRange.minX, input.absRange.maxX),
    y: clamp(y, input.absRange.minY, input.absRange.maxY),
    w: clamp(w, 1, absWidth),
    h: clamp(h, 1, absHeight),
  }

  return { status: "valid", bounds }
}

function activeGameSurface(
  input: TouchBoundsGeometryInput,
): SwayRect | undefined {
  if (input.scalingPolicy._tag === "stretchFill") return input.surfaceRect
  if (input.scalingPolicy._tag === "unknown") return undefined

  const mode = input.gamescopeMode
  if (!mode || mode.width <= 0 || mode.height <= 0) return undefined

  const modeAspect = mode.width / mode.height
  const surfaceAspect = input.surfaceRect.width / input.surfaceRect.height

  if (surfaceAspect > modeAspect) {
    const width = input.surfaceRect.height * modeAspect
    return {
      x: input.surfaceRect.x + (input.surfaceRect.width - width) / 2,
      y: input.surfaceRect.y,
      width,
      height: input.surfaceRect.height,
    }
  }

  const height = input.surfaceRect.width / modeAspect
  return {
    x: input.surfaceRect.x,
    y: input.surfaceRect.y + (input.surfaceRect.height - height) / 2,
    width: input.surfaceRect.width,
    height,
  }
}

function validRect(rect: SwayRect): boolean {
  return rect.width > 0 && rect.height > 0
}

function validAbsRange(range: TouchAbsRange): boolean {
  return range.maxX > range.minX && range.maxY > range.minY
}

function intersectRects(a: SwayRect, b: SwayRect): SwayRect | undefined {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  if (right <= x || bottom <= y) return undefined
  return { x, y, width: right - x, height: bottom - y }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
