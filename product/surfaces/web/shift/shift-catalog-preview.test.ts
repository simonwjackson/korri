import { afterEach, describe, expect, it } from "bun:test"
import { act, cleanup, renderHook } from "@testing-library/react"
import {
  setShiftCatalogPreview,
  useShiftCatalogPreview,
} from "./shift-catalog-preview"
import { shiftCatalogStateSamples } from "./shift-catalog-state-samples"

afterEach(() => {
  setShiftCatalogPreview(null)
  cleanup()
})

describe("shift catalog preview singleton", () => {
  it("defaults to null so the live loader wins in production", () => {
    const { result } = renderHook(() => useShiftCatalogPreview())
    expect(result.current).toBeNull()
  })

  it("returns the pinned sample after set and clears back to null", () => {
    const { result } = renderHook(() => useShiftCatalogPreview())
    const empty = shiftCatalogStateSamples.Empty()

    act(() => setShiftCatalogPreview(empty))
    expect(result.current).toBe(empty)

    act(() => setShiftCatalogPreview(null))
    expect(result.current).toBeNull()
  })

  it("notifies every subscriber (cross-root) when the pin changes", () => {
    const first = renderHook(() => useShiftCatalogPreview())
    const second = renderHook(() => useShiftCatalogPreview())
    const ready = shiftCatalogStateSamples.Ready()

    act(() => setShiftCatalogPreview(ready))

    expect(first.result.current).toBe(ready)
    expect(second.result.current).toBe(ready)
  })
})
