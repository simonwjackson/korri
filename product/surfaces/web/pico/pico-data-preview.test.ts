import { afterEach, describe, expect, it } from "bun:test"
import { act, cleanup, renderHook } from "@testing-library/react"
import {
  getPicoDataPreview,
  PICO_DATA_TAGS,
  picoDataStateSamples,
  setPicoDataPreview,
  usePicoDataPreview,
} from "./pico-data-preview"

afterEach(() => {
  setPicoDataPreview(null)
  cleanup()
})

describe("pico data preview singleton", () => {
  it("defaults to null so the live loader wins in production", () => {
    const { result } = renderHook(() => usePicoDataPreview())
    expect(result.current).toBeNull()
  })

  it("returns the pinned sample after set and clears back to null", () => {
    const sample = picoDataStateSamples.Empty()
    act(() => setPicoDataPreview(sample))
    expect(getPicoDataPreview()).toBe(sample)

    act(() => setPicoDataPreview(null))
    expect(getPicoDataPreview()).toBeNull()
  })
})

describe("picoDataStateSamples", () => {
  it("provides a sample for every pico data tag (exhaustive)", () => {
    expect(Object.keys(picoDataStateSamples).sort()).toEqual(
      [...PICO_DATA_TAGS].sort(),
    )
  })
})
