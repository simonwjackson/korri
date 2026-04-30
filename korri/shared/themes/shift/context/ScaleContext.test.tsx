import { describe, expect, it } from "bun:test"
import { act, renderHook } from "@testing-library/react"
import { SCALE_PRESETS, ScaleProvider, useScale } from "./ScaleContext"

const wrapper =
  (initialIndex?: number) =>
  ({ children }: { children: React.ReactNode }) => (
    <ScaleProvider initialIndex={initialIndex}>{children}</ScaleProvider>
  )

describe("ScaleContext", () => {
  it("throws when useScale is used outside a provider", () => {
    expect(() => renderHook(() => useScale())).toThrow(
      /must be used within a ScaleProvider/,
    )
  })

  it("defaults to Medium (index 1)", () => {
    const { result } = renderHook(() => useScale(), { wrapper: wrapper() })
    expect(result.current.scaleIndex).toBe(1)
    expect(result.current.currentScale.name).toBe("Medium")
  })

  it("toggleScale cycles through presets and wraps to the first", () => {
    const { result } = renderHook(() => useScale(), {
      wrapper: wrapper(SCALE_PRESETS.length - 1),
    })
    expect(result.current.scaleIndex).toBe(SCALE_PRESETS.length - 1)
    act(() => result.current.toggleScale())
    expect(result.current.scaleIndex).toBe(0)
    expect(result.current.currentScale.name).toBe("Small")
  })

  it("setScaleIndex clamps out-of-range indices into the preset range", () => {
    const { result } = renderHook(() => useScale(), { wrapper: wrapper() })
    act(() => result.current.setScaleIndex(99))
    expect(result.current.scaleIndex).toBe(99 % SCALE_PRESETS.length)
    act(() => result.current.setScaleIndex(-1))
    expect(result.current.scaleIndex).toBe(SCALE_PRESETS.length - 1)
  })
})
