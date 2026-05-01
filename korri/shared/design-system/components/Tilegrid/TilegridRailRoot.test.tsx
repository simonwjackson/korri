import { describe, expect, it } from "bun:test"
import { render, renderHook } from "@testing-library/react"
import { type GridItemShape, useTilegrid } from "./Tilegrid.context"
import { TilegridRailRoot } from "./TilegridRailRoot"

interface Tile extends GridItemShape {
  id: string
  span?: number
}

const tile = (id: string, span?: number): Tile => ({ id, span })

const wrap =
  (items: Tile[]) =>
  ({ children }: { children: React.ReactNode }) => (
    <TilegridRailRoot<Tile> items={items} cellSize={120} gap={8}>
      {children}
    </TilegridRailRoot>
  )

describe("TilegridRailRoot", () => {
  it("renders an outer horizontal scroll container and an inner grid row", () => {
    const { container } = render(
      <TilegridRailRoot<Tile>
        items={[tile("a"), tile("b")]}
        cellSize={120}
        gap={10}
      >
        <span>child</span>
      </TilegridRailRoot>,
    )

    const outer = container.firstElementChild as HTMLElement | null
    const grid = outer?.firstElementChild as HTMLElement | null

    expect(outer?.tagName).toBe("DIV")
    expect(outer?.style.overflowX).toBe("auto")
    expect(outer?.style.overflowY).toBe("hidden")

    expect(grid?.tagName).toBe("DIV")
    expect(grid?.style.display).toBe("grid")
    expect(grid?.style.gridAutoFlow).toBe("column")
    expect(grid?.style.gridAutoColumns).toBe("120px")
    expect(grid?.style.gridTemplateRows).toBe("120px")
    expect(grid?.style.gap).toBe("10px")
  })

  it("slots grid styles onto a single child when asChild is true", () => {
    const { getByTestId } = render(
      <TilegridRailRoot<Tile>
        items={[tile("a")]}
        cellSize={140}
        gap={12}
        className="root-rail"
        asChild
      >
        <section data-testid="rail" className="child-rail">
          child
        </section>
      </TilegridRailRoot>,
    )

    const rail = getByTestId("rail")
    expect(rail.tagName).toBe("SECTION")
    expect(rail.classList.contains("root-rail")).toBe(true)
    expect(rail.classList.contains("child-rail")).toBe(true)
    expect(rail.style.display).toBe("grid")
    expect(rail.style.gridAutoFlow).toBe("column")
    expect(rail.style.gridAutoColumns).toBe("140px")
    expect(rail.style.gridTemplateRows).toBe("140px")
    expect(rail.style.gap).toBe("12px")
  })

  it("publishes maxSpan as { columns: 1, rows: 1 } so spans clamp to 1", () => {
    const { result } = renderHook(() => useTilegrid<Tile>(), {
      wrapper: wrap([tile("hero", 3), tile("a"), tile("b")]),
    })
    expect(result.current.base.maxSpan.columns).toBe(1)
    expect(result.current.base.maxSpan.rows).toBe(1)
  })

  it("forces every item's effective span to 1 via getSpan", () => {
    const { result } = renderHook(() => useTilegrid<Tile>(), {
      wrapper: wrap([tile("hero", 3), tile("a", 2), tile("b")]),
    })
    expect(result.current.base.getSpan(tile("hero", 3))).toBe(1)
    expect(result.current.base.getSpan(tile("a", 2))).toBe(1)
  })

  it("publishes columns equal to items.length for downstream consumers", () => {
    const items = [tile("a"), tile("b"), tile("c")]
    const { result } = renderHook(() => useTilegrid<Tile>(), {
      wrapper: wrap(items),
    })
    expect(result.current.base.columns).toBe(3)
  })

  it("publishes columns of 1 for an empty rail", () => {
    const { result } = renderHook(() => useTilegrid<Tile>(), {
      wrapper: wrap([]),
    })
    expect(result.current.base.columns).toBe(1)
    expect(result.current.base.items.length).toBe(0)
  })

  it("does not publish a paged extension", () => {
    const { result } = renderHook(() => useTilegrid<Tile>(), {
      wrapper: wrap([tile("a")]),
    })
    expect(result.current.paged).toBeUndefined()
  })

  it("renders no measurement sentinels when cellSize and gap are numbers", () => {
    const { container } = render(
      <TilegridRailRoot<Tile> items={[tile("a")]} cellSize={120} gap={8}>
        <span>child</span>
      </TilegridRailRoot>,
    )
    expect(container.querySelectorAll("[data-tilegrid-sentinel]").length).toBe(
      0,
    )
  })

  it("renders a cellSize sentinel with the verbatim CSS expression when cellSize is a string", () => {
    const { container } = render(
      <TilegridRailRoot<Tile> items={[tile("a")]} cellSize="6rem" gap={8}>
        <span>child</span>
      </TilegridRailRoot>,
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

  it("uses the verbatim string in gridAutoColumns and gridTemplateRows when cellSize is a string", () => {
    const { container } = render(
      <TilegridRailRoot<Tile> items={[tile("a")]} cellSize="6rem" gap={8}>
        <span>child</span>
      </TilegridRailRoot>,
    )
    const outer = container.firstElementChild as HTMLElement
    const grid = outer.querySelector<HTMLElement>("div[style*='display: grid']")
    expect(grid?.style.gridAutoColumns).toBe("6rem")
    expect(grid?.style.gridTemplateRows).toBe("6rem")
    expect(grid?.style.gap).toBe("8px")
  })

  it("renders a gap sentinel with the verbatim CSS expression when gap is a string", () => {
    const { container } = render(
      <TilegridRailRoot<Tile> items={[tile("a")]} cellSize={120} gap="0.5rem">
        <span>child</span>
      </TilegridRailRoot>,
    )
    const sentinel = container.querySelector<HTMLElement>(
      '[data-tilegrid-sentinel="gap"]',
    )
    expect(sentinel).not.toBeNull()
    expect(sentinel?.style.width).toBe("0.5rem")
  })

  it("uses the verbatim string in the gap CSS when gap is a string", () => {
    const { container } = render(
      <TilegridRailRoot<Tile> items={[tile("a")]} cellSize={120} gap="0.5rem">
        <span>child</span>
      </TilegridRailRoot>,
    )
    const grid = container.querySelector<HTMLElement>(
      "div[style*='display: grid']",
    )
    expect(grid?.style.gap).toBe("0.5rem")
  })

  it("renders both sentinels when cellSize and gap are both strings", () => {
    const { container } = render(
      <TilegridRailRoot<Tile> items={[tile("a")]} cellSize="6rem" gap="0.5rem">
        <span>child</span>
      </TilegridRailRoot>,
    )
    expect(
      container.querySelector('[data-tilegrid-sentinel="cell-size"]'),
    ).not.toBeNull()
    expect(
      container.querySelector('[data-tilegrid-sentinel="gap"]'),
    ).not.toBeNull()
  })

  it("sets position: relative on the outer wrapper so percent-sized sentinels resolve against the rail", () => {
    const { container } = render(
      <TilegridRailRoot<Tile> items={[tile("a")]} cellSize={120} gap={8}>
        <span>child</span>
      </TilegridRailRoot>,
    )
    const outer = container.firstElementChild as HTMLElement
    expect(outer.style.position).toBe("relative")
  })
})
