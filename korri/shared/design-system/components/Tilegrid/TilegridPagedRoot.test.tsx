import { describe, expect, it } from "bun:test"
import { act, renderHook } from "@testing-library/react"
import { type GridItemShape, useTilegrid } from "./Tilegrid.context"
import { TilegridPagedRoot } from "./TilegridPagedRoot"

interface Tile extends GridItemShape {
  id: string
  span?: number
}

const tile = (id: string, span?: number): Tile => ({ id, span })

const wrapWithLayout =
  (items: Tile[], columns: number, rows: number) =>
  ({ children }: { children: React.ReactNode }) => (
    <TilegridPagedRoot<Tile>
      items={items}
      cellSize={100}
      gap={0}
      _testColumns={columns}
      _testRows={rows}
    >
      {children}
    </TilegridPagedRoot>
  )

describe("TilegridPagedRoot", () => {
  it("publishes paged extension with currentPage and totalPages", () => {
    const items = Array.from({ length: 25 }, (_, i) => tile(`g-${i}`))
    const { result } = renderHook(() => useTilegrid<Tile>(), {
      wrapper: wrapWithLayout(items, 4, 3),
    })
    expect(result.current.paged?.currentPage).toBe(0)
    expect(result.current.paged?.totalPages).toBe(3)
  })

  it("publishes the current page's items as base.items", () => {
    const items = Array.from({ length: 25 }, (_, i) => tile(`g-${i}`))
    const { result } = renderHook(() => useTilegrid<Tile>(), {
      wrapper: wrapWithLayout(items, 4, 3),
    })
    // Page 0 has 12 items.
    expect(result.current.base.items.length).toBe(12)
    expect(result.current.base.items[0]?.id).toBe("g-0")
  })

  it("next() advances currentPage and swaps base.items", () => {
    const items = Array.from({ length: 25 }, (_, i) => tile(`g-${i}`))
    const { result } = renderHook(() => useTilegrid<Tile>(), {
      wrapper: wrapWithLayout(items, 4, 3),
    })
    act(() => result.current.paged?.next())
    expect(result.current.paged?.currentPage).toBe(1)
    expect(result.current.base.items.length).toBe(12)
    expect(result.current.base.items[0]?.id).toBe("g-12")
  })

  it("next() at the last page is a no-op (no cycling)", () => {
    const items = Array.from({ length: 4 }, (_, i) => tile(`g-${i}`))
    const { result } = renderHook(() => useTilegrid<Tile>(), {
      wrapper: wrapWithLayout(items, 2, 2),
    })
    expect(result.current.paged?.totalPages).toBe(1)
    act(() => result.current.paged?.next())
    expect(result.current.paged?.currentPage).toBe(0)
  })

  it("prev() at page 0 is a no-op", () => {
    const items = Array.from({ length: 25 }, (_, i) => tile(`g-${i}`))
    const { result } = renderHook(() => useTilegrid<Tile>(), {
      wrapper: wrapWithLayout(items, 4, 3),
    })
    act(() => result.current.paged?.prev())
    expect(result.current.paged?.currentPage).toBe(0)
  })

  it("goToPage clamps below 0 to 0 and above totalPages-1 to last", () => {
    const items = Array.from({ length: 25 }, (_, i) => tile(`g-${i}`))
    const { result } = renderHook(() => useTilegrid<Tile>(), {
      wrapper: wrapWithLayout(items, 4, 3),
    })
    act(() => result.current.paged?.goToPage(-5))
    expect(result.current.paged?.currentPage).toBe(0)
    act(() => result.current.paged?.goToPage(99))
    expect(result.current.paged?.currentPage).toBe(2)
  })

  it("publishes maxSpan as { columns, rows } in paged mode", () => {
    const { result } = renderHook(() => useTilegrid<Tile>(), {
      wrapper: wrapWithLayout([tile("a")], 4, 3),
    })
    expect(result.current.base.maxSpan.columns).toBe(4)
    expect(result.current.base.maxSpan.rows).toBe(3)
  })

  it("publishes 1 totalPage and 0 cells when items is empty", () => {
    const { result } = renderHook(() => useTilegrid<Tile>(), {
      wrapper: wrapWithLayout([], 4, 3),
    })
    expect(result.current.paged?.totalPages).toBe(1)
    expect(result.current.base.items.length).toBe(0)
  })

  it("places a 2x2 hero on page 1 and packs 8 single tiles around it", () => {
    const items = [
      tile("hero", 2),
      ...Array.from({ length: 8 }, (_, i) => tile(`s-${i}`)),
    ]
    const { result } = renderHook(() => useTilegrid<Tile>(), {
      wrapper: wrapWithLayout(items, 4, 3),
    })
    expect(result.current.paged?.totalPages).toBe(1)
    expect(result.current.base.items.length).toBe(9)
    expect(result.current.base.items[0]?.id).toBe("hero")
  })
})
