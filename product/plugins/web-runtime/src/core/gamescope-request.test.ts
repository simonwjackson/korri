import { describe, expect, it } from "bun:test"
import { gamescopeAnnotation, webCompositorRequest } from "./gamescope-request"

describe("webCompositorRequest", () => {
  it("derives internal res = native + gap for a fixed-canvas engine", () => {
    const req = webCompositorRequest({
      native: { width: 1008, height: 720 },
      fixedCanvas: true,
      gap: { width: 20, height: 20 },
      output: { width: 1920, height: 1080 },
    })
    expect(req.internal).toEqual({ width: 1028, height: 740 })
    expect(req.output).toEqual({ width: 1920, height: 1080 })
    expect(req.filter).toBe("pixel")
  })

  it("uses native unchanged for a responsive engine", () => {
    const req = webCompositorRequest({
      native: { width: 832, height: 448 },
      fixedCanvas: false,
      gap: { width: 20, height: 20 },
      output: { width: 1920, height: 1080 },
    })
    expect(req.internal).toEqual({ width: 832, height: 448 })
  })
})

describe("gamescopeAnnotation", () => {
  it("maps a compositor request to a gamescope policy annotation", () => {
    const annotation = gamescopeAnnotation({
      internal: { width: 1028, height: 740 },
      output: { width: 1920, height: 1080 },
      filter: "pixel",
    })
    expect(annotation).toMatchObject({
      backend: { type: "wayland" },
      display: {
        nested: { width: 1028, height: 740, refresh: 60 },
        output: { width: 1920, height: 1080 },
      },
      scaling: { scaler: "fit", filter: "pixel" },
      window: { fullscreen: true, forceWindowsFullscreen: true },
    })
  })

  it("honors a custom refresh rate", () => {
    const annotation = gamescopeAnnotation({
      internal: { width: 1028, height: 740 },
      output: { width: 1920, height: 1080 },
      filter: "pixel",
      refresh: 120,
    })
    expect(
      (annotation as { display: { nested: { refresh: number } } }).display
        .nested.refresh,
    ).toBe(120)
  })
})
