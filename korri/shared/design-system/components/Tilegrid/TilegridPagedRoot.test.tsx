import { describe, expect, it } from "bun:test"
import { act, render, renderHook } from "@testing-library/react"
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

  it("renders an inner grid div by default", () => {
    const { container } = render(
      <TilegridPagedRoot<Tile>
        items={[tile("a")]}
        cellSize={100}
        gap={8}
        _testColumns={4}
        _testRows={3}
      >
        <span>child</span>
      </TilegridPagedRoot>,
    )

    const outer = container.firstElementChild as HTMLElement | null
    const grid = outer?.firstElementChild as HTMLElement | null

    expect(outer?.tagName).toBe("DIV")
    expect(outer?.style.overflow).toBe("hidden")
    expect(grid?.tagName).toBe("DIV")
    expect(grid?.style.display).toBe("grid")
    expect(grid?.style.gridTemplateColumns).toBe("repeat(4, 100px)")
    expect(grid?.style.gridTemplateRows).toBe("repeat(3, 100px)")
  })

  it("slots grid styles onto a single child when asChild is true", () => {
    const { getByTestId } = render(
      <TilegridPagedRoot<Tile>
        items={[tile("a")]}
        cellSize={90}
        gap={6}
        className="root-grid"
        asChild
        _testColumns={5}
        _testRows={4}
      >
        <section data-testid="grid" className="child-grid">
          child
        </section>
      </TilegridPagedRoot>,
    )

    const grid = getByTestId("grid")
    expect(grid.tagName).toBe("SECTION")
    expect(grid.classList.contains("root-grid")).toBe(true)
    expect(grid.classList.contains("child-grid")).toBe(true)
    expect(grid.style.display).toBe("grid")
    expect(grid.style.gridTemplateColumns).toBe("repeat(5, 90px)")
    expect(grid.style.gridTemplateRows).toBe("repeat(4, 90px)")
    expect(grid.style.gap).toBe("6px")
  })

  it("keeps publishing paged context inside an asChild grid", () => {
    function Probe() {
      const { paged } = useTilegrid<Tile>()
      return <span data-testid="pages">{paged?.totalPages}</span>
    }

    const { getByTestId } = render(
      <TilegridPagedRoot<Tile>
        items={Array.from({ length: 13 }, (_, i) => tile(`g-${i}`))}
        cellSize={100}
        gap={0}
        asChild
        _testColumns={4}
        _testRows={3}
      >
        <section data-testid="grid">
          <Probe />
        </section>
      </TilegridPagedRoot>,
    )

    expect(getByTestId("pages").textContent).toBe("2")
  })

  it("renders no measurement sentinels when cellSize and gap are numbers", () => {
    const { container } = render(
      <TilegridPagedRoot<Tile>
        items={[tile("a")]}
        cellSize={100}
        gap={8}
        _testColumns={4}
        _testRows={3}
      >
        <span>child</span>
      </TilegridPagedRoot>,
    )
    expect(container.querySelectorAll("[data-tilegrid-sentinel]").length).toBe(
      0,
    )
  })

  it("renders a cellSize sentinel with the verbatim CSS expression when cellSize is a string", () => {
    const { container } = render(
      <TilegridPagedRoot<Tile>
        items={[tile("a")]}
        cellSize="6rem"
        gap={8}
        _testColumns={4}
        _testRows={3}
      >
        <span>child</span>
      </TilegridPagedRoot>,
    )
    const sentinel = container.querySelector<HTMLElement>(
      '[data-tilegrid-sentinel="cell-size"]',
    )
    expect(sentinel).not.toBeNull()
    expect(sentinel?.style.width).toBe("6rem")
    expect(sentinel?.style.position).toBe("absolute")
    expect(sentinel?.style.visibility).toBe("hidden")
    expect(sentinel?.getAttribute("aria-hidden")).toBe("true")
  })

  it("uses the verbatim string in gridTemplateColumns and gridTemplateRows when cellSize is a string", () => {
    const { container } = render(
      <TilegridPagedRoot<Tile>
        items={[tile("a")]}
        cellSize="6rem"
        gap={8}
        _testColumns={3}
        _testRows={2}
      >
        <span>child</span>
      </TilegridPagedRoot>,
    )
    const grid = container.querySelector<HTMLElement>(
      "div[style*='display: grid']",
    )
    expect(grid?.style.gridTemplateColumns).toBe("repeat(3, 6rem)")
    expect(grid?.style.gridTemplateRows).toBe("repeat(2, 6rem)")
    expect(grid?.style.gap).toBe("8px")
  })

  it("renders a gap sentinel with the verbatim CSS expression when gap is a string", () => {
    const { container } = render(
      <TilegridPagedRoot<Tile>
        items={[tile("a")]}
        cellSize={100}
        gap="0.5rem"
        _testColumns={4}
        _testRows={3}
      >
        <span>child</span>
      </TilegridPagedRoot>,
    )
    const sentinel = container.querySelector<HTMLElement>(
      '[data-tilegrid-sentinel="gap"]',
    )
    expect(sentinel).not.toBeNull()
    expect(sentinel?.style.width).toBe("0.5rem")
  })

  it("_testColumns and _testRows continue to bypass measurement when cellSize is a string", () => {
    // Pinning columns/rows via the test escape hatch keeps pagination
    // deterministic even though happy-dom never resolves the rem sentinel.
    const items = Array.from({ length: 25 }, (_, i) => tile(`g-${i}`))
    const { result } = renderHook(() => useTilegrid<Tile>(), {
      wrapper: ({ children }) => (
        <TilegridPagedRoot<Tile>
          items={items}
          cellSize="6rem"
          gap={8}
          _testColumns={4}
          _testRows={3}
        >
          {children}
        </TilegridPagedRoot>
      ),
    })
    expect(result.current.paged?.totalPages).toBe(3)
    expect(result.current.base.maxSpan.columns).toBe(4)
    expect(result.current.base.maxSpan.rows).toBe(3)
  })

  it("falls back to columns/rows of 1 while a string cellSize is unresolved and no test override is provided", () => {
    const { result } = renderHook(() => useTilegrid<Tile>(), {
      wrapper: ({ children }) => (
        <TilegridPagedRoot<Tile>
          items={[tile("a"), tile("b")]}
          cellSize="6rem"
          gap={8}
        >
          {children}
        </TilegridPagedRoot>
      ),
    })
    expect(result.current.base.columns).toBe(1)
    expect(result.current.base.maxSpan.columns).toBe(1)
    expect(result.current.base.maxSpan.rows).toBe(1)
  })

  it("sets position: relative on the outer wrapper so percent-sized sentinels resolve against the paged container", () => {
    const { container } = render(
      <TilegridPagedRoot<Tile>
        items={[tile("a")]}
        cellSize={100}
        gap={8}
        _testColumns={4}
        _testRows={3}
      >
        <span>child</span>
      </TilegridPagedRoot>,
    )
    const outer = container.firstElementChild as HTMLElement
    expect(outer.style.position).toBe("relative")
  })
})
