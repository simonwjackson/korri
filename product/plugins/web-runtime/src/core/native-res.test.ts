import { describe, expect, it } from "bun:test"
import {
  gamescopeInternalResolution,
  nativeResolutionFromCanvas,
} from "./native-res"

describe("nativeResolutionFromCanvas", () => {
  it("uses the canvas backing store as the native render target", () => {
    // backing store is independent of CSS/viewport size — that is the lesson
    expect(
      nativeResolutionFromCanvas({
        backingStore: { width: 1008, height: 720 },
      }),
    ).toEqual({ width: 1008, height: 720 })
  })

  it("prefers backing store even when a drawing buffer is reported", () => {
    expect(
      nativeResolutionFromCanvas({
        backingStore: { width: 832, height: 448 },
        drawingBuffer: { width: 832, height: 448 },
      }),
    ).toEqual({ width: 832, height: 448 })
  })

  it("rejects a zero-sized backing store", () => {
    expect(() =>
      nativeResolutionFromCanvas({ backingStore: { width: 0, height: 720 } }),
    ).toThrow()
  })
})

describe("gamescopeInternalResolution", () => {
  it("inflates a fixed-canvas engine by the device gap to avoid scrollbars", () => {
    expect(
      gamescopeInternalResolution({
        native: { width: 1008, height: 720 },
        fixedCanvas: true,
        gap: { width: 20, height: 20 },
      }),
    ).toEqual({ width: 1028, height: 740 })
  })

  it("uses native unchanged for a responsive engine", () => {
    expect(
      gamescopeInternalResolution({
        native: { width: 832, height: 448 },
        fixedCanvas: false,
        gap: { width: 20, height: 20 },
      }),
    ).toEqual({ width: 832, height: 448 })
  })
})
