import { describe, expect, it, mock } from "bun:test"
import { renderHook } from "@testing-library/react"
import { useResolvedCSSLength } from "./useResolvedCSSLength"

describe("useResolvedCSSLength", () => {
  it("returns the input directly when value is a number", () => {
    const { result } = renderHook(() => useResolvedCSSLength(120))
    expect(result.current.resolvedPx).toBe(120)
    expect(result.current.cssValue).toBe("120px")
  })

  it("does not instantiate a ResizeObserver when value is a number", () => {
    const original = globalThis.ResizeObserver
    const ctor = mock(
      () =>
        ({
          observe: () => {},
          unobserve: () => {},
          disconnect: () => {},
        }) as unknown as ResizeObserver,
    )
    globalThis.ResizeObserver = ctor as unknown as typeof ResizeObserver
    try {
      renderHook(() => useResolvedCSSLength(140))
      expect(ctor).not.toHaveBeenCalled()
    } finally {
      globalThis.ResizeObserver = original
    }
  })

  it("returns the verbatim string as cssValue and null resolvedPx before measurement", () => {
    const { result } = renderHook(() => useResolvedCSSLength("6rem"))
    expect(result.current.cssValue).toBe("6rem")
    expect(result.current.resolvedPx).toBeNull()
  })

  it("returns a stable ref that the consumer can bind to a sentinel element", () => {
    const { result } = renderHook(() => useResolvedCSSLength("var(--cell)"))
    expect(result.current.ref).toBeDefined()
    expect(result.current.ref.current).toBeNull()
  })

  it("returns the new number synchronously when transitioning string -> number", () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: number | string }) => useResolvedCSSLength(value),
      { initialProps: { value: "5rem" as number | string } },
    )
    expect(result.current.resolvedPx).toBeNull()
    expect(result.current.cssValue).toBe("5rem")

    rerender({ value: 80 })
    expect(result.current.resolvedPx).toBe(80)
    expect(result.current.cssValue).toBe("80px")
  })

  it("returns null resolvedPx and verbatim cssValue when transitioning number -> string", () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: number | string }) => useResolvedCSSLength(value),
      { initialProps: { value: 100 as number | string } },
    )
    expect(result.current.resolvedPx).toBe(100)
    expect(result.current.cssValue).toBe("100px")

    rerender({ value: "10rem" })
    expect(result.current.resolvedPx).toBeNull()
    expect(result.current.cssValue).toBe("10rem")
  })

  it("instantiates a ResizeObserver and disconnects it on unmount when value is a string", () => {
    const original = globalThis.ResizeObserver
    const disconnect = mock(() => {})
    const observe = mock(() => {})
    const ctor = mock(
      () =>
        ({
          observe,
          unobserve: () => {},
          disconnect,
        }) as unknown as ResizeObserver,
    )
    globalThis.ResizeObserver = ctor as unknown as typeof ResizeObserver
    try {
      const { unmount } = renderHook(() => {
        const result = useResolvedCSSLength("4rem")
        // Bind the ref to a real DOM node so the effect's `ref.current` is
        // not null and the observer is created.
        if (result.ref.current === null) {
          ;(result.ref as { current: HTMLElement | null }).current =
            document.createElement("div")
        }
        return result
      })
      // Force a second render so the effect re-runs with the bound ref.
      // (renderHook already runs effects after the initial render, but the
      // ref assignment above happened during render; trigger another render
      // by unmounting cleanly instead.)
      unmount()
      expect(ctor).toHaveBeenCalled()
      expect(disconnect).toHaveBeenCalled()
    } finally {
      globalThis.ResizeObserver = original
    }
  })
})
