import { describe, expect, it } from "bun:test"
import { renderHook } from "@testing-library/react"
import {
  clampSpan,
  type GridItemShape,
  useTilegrid,
} from "./Tilegrid.context"

describe("useTilegrid", () => {
  it("throws when used outside a Tilegrid Root", () => {
    expect(() =>
      renderHook(() => useTilegrid<GridItemShape>()),
    ).toThrow(/must be used within a TilegridScrollRoot or TilegridPagedRoot/)
  })
})

describe("clampSpan", () => {
  it("returns 1 for spans below 1", () => {
    expect(clampSpan(0, { columns: 4, rows: 4 })).toBe(1)
    expect(clampSpan(-3, { columns: 4, rows: 4 })).toBe(1)
  })

  it("floors fractional spans before clamping", () => {
    expect(clampSpan(2.9, { columns: 4, rows: 4 })).toBe(2)
    expect(clampSpan(1.1, { columns: 4, rows: 4 })).toBe(1)
  })

  it("clamps span to maxSpan.columns when columns is the bottleneck", () => {
    expect(clampSpan(99, { columns: 3, rows: 10 })).toBe(3)
  })

  it("clamps span to maxSpan.rows when rows is the bottleneck", () => {
    expect(clampSpan(99, { columns: 10, rows: 2 })).toBe(2)
  })

  it("treats Infinity rows as unbounded (scroll-mode case)", () => {
    expect(clampSpan(5, { columns: 8, rows: Infinity })).toBe(5)
  })

  it("returns the original span when within bounds", () => {
    expect(clampSpan(2, { columns: 4, rows: 4 })).toBe(2)
  })
})
