import { describe, expect, it } from "bun:test"
import { computeTouchBoundsFromGeometry } from "./touch-bounds-geometry"

const output = { x: 0, y: 0, width: 1920, height: 1080 }
const absRange = { minX: 0, maxX: 1919, minY: 0, maxY: 1079 }

describe("touch bounds geometry", () => {
  it("maps a fullscreen surface to the full ABS range", () => {
    expect(
      computeTouchBoundsFromGeometry({
        outputRect: output,
        surfaceRect: output,
        absRange,
        scalingPolicy: { _tag: "stretchFill" },
      }),
    ).toEqual({ status: "valid", bounds: { x: 0, y: 0, w: 1920, h: 1080 } })
  })

  it("maps half of an output to the corresponding half ABS range", () => {
    expect(
      computeTouchBoundsFromGeometry({
        outputRect: output,
        surfaceRect: { x: 960, y: 0, width: 960, height: 1080 },
        absRange,
        scalingPolicy: { _tag: "stretchFill" },
      }),
    ).toEqual({ status: "valid", bounds: { x: 960, y: 0, w: 960, h: 1080 } })
  })

  it("updates the ABS origin when the same surface moves", () => {
    const left = computeTouchBoundsFromGeometry({
      outputRect: output,
      surfaceRect: { x: 0, y: 0, width: 960, height: 1080 },
      absRange,
      scalingPolicy: { _tag: "stretchFill" },
    })
    const right = computeTouchBoundsFromGeometry({
      outputRect: output,
      surfaceRect: { x: 960, y: 0, width: 960, height: 1080 },
      absRange,
      scalingPolicy: { _tag: "stretchFill" },
    })

    expect(left).toEqual({ status: "valid", bounds: { x: 0, y: 0, w: 960, h: 1080 } })
    expect(right).toEqual({ status: "valid", bounds: { x: 960, y: 0, w: 960, h: 1080 } })
  })

  it("clamps surfaces that are partially outside the output", () => {
    expect(
      computeTouchBoundsFromGeometry({
        outputRect: output,
        surfaceRect: { x: -100, y: -50, width: 600, height: 500 },
        absRange,
        scalingPolicy: { _tag: "stretchFill" },
      }),
    ).toEqual({ status: "valid", bounds: { x: 0, y: 0, w: 500, h: 450 } })
  })

  it("rejects invalid geometry instead of throwing", () => {
    expect(
      computeTouchBoundsFromGeometry({
        outputRect: { x: 0, y: 0, width: 0, height: 1080 },
        surfaceRect: output,
        absRange,
        scalingPolicy: { _tag: "stretchFill" },
      }).status,
    ).toBe("invalid")

    expect(
      computeTouchBoundsFromGeometry({
        outputRect: output,
        surfaceRect: { x: 0, y: 0, width: 0, height: 1080 },
        absRange,
        scalingPolicy: { _tag: "stretchFill" },
      }).status,
    ).toBe("invalid")
  })

  it("maps only the derived inner viewport for fit letterbox policy", () => {
    expect(
      computeTouchBoundsFromGeometry({
        outputRect: output,
        surfaceRect: { x: 0, y: 0, width: 1920, height: 1080 },
        absRange,
        scalingPolicy: { _tag: "fitLetterbox" },
        gamescopeMode: { width: 1024, height: 768 },
      }),
    ).toEqual({ status: "valid", bounds: { x: 240, y: 0, w: 1440, h: 1080 } })
  })

  it("fails closed for aspect mismatch with unknown scaling policy", () => {
    expect(
      computeTouchBoundsFromGeometry({
        outputRect: output,
        surfaceRect: { x: 0, y: 0, width: 1920, height: 1080 },
        absRange,
        scalingPolicy: { _tag: "unknown" },
        gamescopeMode: { width: 1024, height: 768 },
      }).status,
    ).toBe("invalid")
  })
})
