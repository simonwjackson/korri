// Native render resolution + gamescope internal-resolution math.
//
// A web game's native render target is the canvas BACKING STORE
// (`canvas.width`/`canvas.height`), which is independent of the CSS/viewport
// size. Fixed-canvas engines (e.g. GameMaker) draw a constant backing store, so
// the canvas can exceed the browser viewport and produce scrollbars/clipping;
// to make the viewport equal the canvas under gamescope we inflate gamescope's
// internal resolution by a per-device gap constant. Responsive engines (e.g.
// Construct) letterbox-scale themselves, so internal == native.

export interface Dimensions {
  readonly width: number
  readonly height: number
}

export interface CanvasMeasurement {
  readonly backingStore: Dimensions
  readonly drawingBuffer?: Dimensions | null
}

function assertPositive(dims: Dimensions): void {
  if (
    !Number.isFinite(dims.width) ||
    !Number.isFinite(dims.height) ||
    dims.width <= 0 ||
    dims.height <= 0
  ) {
    throw new RangeError(
      `native resolution must be positive, got ${dims.width}x${dims.height}`,
    )
  }
}

export function nativeResolutionFromCanvas(
  measurement: CanvasMeasurement,
): Dimensions {
  assertPositive(measurement.backingStore)
  return {
    width: measurement.backingStore.width,
    height: measurement.backingStore.height,
  }
}

export interface InternalResolutionInput {
  readonly native: Dimensions
  readonly fixedCanvas: boolean
  readonly gap: Dimensions
}

export function gamescopeInternalResolution(
  input: InternalResolutionInput,
): Dimensions {
  if (!input.fixedCanvas) {
    return { width: input.native.width, height: input.native.height }
  }
  return {
    width: input.native.width + input.gap.width,
    height: input.native.height + input.gap.height,
  }
}
