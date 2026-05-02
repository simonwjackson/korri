import { describe, expect, it } from "bun:test"
import { render, renderHook } from "@testing-library/react"
import { type GridItemShape, useTilegrid } from "./Tilegrid.context"
import { TilegridScrollRoot } from "./TilegridScrollRoot"

interface Tile extends GridItemShape {
  id: string
  span?: number
}

const items: Tile[] = [{ id: "a" }]

describe("TilegridScrollRoot", () => {
  it("renders an inner grid div by default", () => {
    const { container } = render(
      <TilegridScrollRoot<Tile> items={items} cellSize={100} gap={8}>
        <span>child</span>
      </TilegridScrollRoot>,
    )

    const outer = container.firstElementChild as HTMLElement | null
    const grid = outer?.firstElementChild as HTMLElement | null

    expect(outer?.tagName).toBe("DIV")
    expect(outer?.style.overflowY).toBe("auto")
    expect(grid?.tagName).toBe("DIV")
    expect(grid?.style.display).toBe("grid")
    expect(grid?.style.gridAutoRows).toBe("100px")
    expect(grid?.style.gap).toBe("8px")
  })

  it("slots grid styles onto a single child when asChild is true", () => {
    const { getByTestId } = render(
      <TilegridScrollRoot<Tile>
        items={items}
        cellSize={120}
        gap={10}
        className="root-grid"
        asChild
      >
        <section data-testid="grid" className="child-grid">
          child
        </section>
      </TilegridScrollRoot>,
    )

    const grid = getByTestId("grid")
    expect(grid.tagName).toBe("SECTION")
    expect(grid.classList.contains("root-grid")).toBe(true)
    expect(grid.classList.contains("child-grid")).toBe(true)
    expect(grid.style.display).toBe("grid")
    expect(grid.style.gridAutoRows).toBe("120px")
    expect(grid.style.gap).toBe("10px")
  })

  it("keeps the outer scroll container as a div when asChild is true", () => {
    const { container } = render(
      <TilegridScrollRoot<Tile> items={items} cellSize={100} gap={8} asChild>
        <section data-testid="grid">child</section>
      </TilegridScrollRoot>,
    )

    const outer = container.firstElementChild as HTMLElement | null
    expect(outer?.tagName).toBe("DIV")
    expect(outer?.style.overflowY).toBe("auto")
    // The slotted grid is the last child after any (unused) sentinels.
    expect(outer?.lastElementChild?.tagName).toBe("SECTION")
  })

  it("renders no measurement sentinels when cellSize and gap are numbers", () => {
    const { container } = render(
      <TilegridScrollRoot<Tile> items={items} cellSize={100} gap={8}>
        <span>child</span>
      </TilegridScrollRoot>,
    )
    expect(container.querySelectorAll("[data-tilegrid-sentinel]").length).toBe(
      0,
    )
  })

  it("renders a cellSize sentinel with the verbatim CSS expression when cellSize is a string", () => {
    const { container } = render(
      <TilegridScrollRoot<Tile> items={items} cellSize="6rem" gap={8}>
        <span>child</span>
      </TilegridScrollRoot>,
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

  it("uses the verbatim string in gridTemplateColumns and gridAutoRows when cellSize is a string", () => {
    const { container } = render(
      <TilegridScrollRoot<Tile> items={items} cellSize="6rem" gap={8}>
        <span>child</span>
      </TilegridScrollRoot>,
    )
    const grid = container.querySelector<HTMLElement>(
      "div[style*='display: grid']",
    )
    expect(grid?.style.gridTemplateColumns).toBe("repeat(1, 6rem)")
    expect(grid?.style.gridAutoRows).toBe("6rem")
    expect(grid?.style.gap).toBe("8px")
  })

  it("renders a gap sentinel with the verbatim CSS expression when gap is a string", () => {
    const { container } = render(
      <TilegridScrollRoot<Tile> items={items} cellSize={100} gap="0.5rem">
        <span>child</span>
      </TilegridScrollRoot>,
    )
    const sentinel = container.querySelector<HTMLElement>(
      '[data-tilegrid-sentinel="gap"]',
    )
    expect(sentinel).not.toBeNull()
    expect(sentinel?.style.width).toBe("0.5rem")
  })

  it("falls back to columns: 1 and clamps spans to 1 while a string cellSize is unresolved", () => {
    // happy-dom does not drive ResizeObserver, so the sentinel never reports
    // a measurement and resolvedPx stays null. The Root must publish
    // columns: 1 so spans clamp to 1 rather than rendering at column 0.
    const item: Tile = { id: "hero", span: 3 }
    const { result } = renderHook(() => useTilegrid<Tile>(), {
      wrapper: ({ children }) => (
        <TilegridScrollRoot<Tile> items={[item]} cellSize="6rem" gap={8}>
          {children}
        </TilegridScrollRoot>
      ),
    })
    expect(result.current.base.columns).toBe(1)
    expect(result.current.base.maxSpan.columns).toBe(1)
  })

  it("publishes resolved cellSize and gap as 0 in context while strings are unresolved", () => {
    const { result } = renderHook(() => useTilegrid<Tile>(), {
      wrapper: ({ children }) => (
        <TilegridScrollRoot<Tile> items={items} cellSize="6rem" gap="0.5rem">
          {children}
        </TilegridScrollRoot>
      ),
    })
    expect(result.current.base.cellSize).toBe(0)
    expect(result.current.base.gap).toBe(0)
  })

  it("sets position: relative on the outer wrapper so percent-sized sentinels resolve against the scroll container", () => {
    const { container } = render(
      <TilegridScrollRoot<Tile> items={items} cellSize={100} gap={8}>
        <span>child</span>
      </TilegridScrollRoot>,
    )
    const outer = container.firstElementChild as HTMLElement
    expect(outer.style.position).toBe("relative")
  })

  describe("Mario-camera opt-in", () => {
    it('sets data-mario-camera="block" on the outer scroll container', () => {
      const { container } = render(
        <TilegridScrollRoot<Tile> items={items} cellSize={100} gap={8}>
          <span>child</span>
        </TilegridScrollRoot>,
      )
      const outer = container.firstElementChild as HTMLElement
      expect(outer.getAttribute("data-mario-camera")).toBe("block")
    })

    it('preserves the existing data-pointer-wheel="2d" attribute alongside data-mario-camera', () => {
      const { container } = render(
        <TilegridScrollRoot<Tile> items={items} cellSize={100} gap={8}>
          <span>child</span>
        </TilegridScrollRoot>,
      )
      const outer = container.firstElementChild as HTMLElement
      expect(outer.getAttribute("data-pointer-wheel")).toBe("2d")
      expect(outer.getAttribute("data-mario-camera")).toBe("block")
    })

    it("sets container-type: size on the outer scroll container so cqb resolves correctly inside the grid", () => {
      const { container } = render(
        <TilegridScrollRoot<Tile> items={items} cellSize={100} gap={8}>
          <span>child</span>
        </TilegridScrollRoot>,
      )
      const outer = container.firstElementChild as HTMLElement
      expect(outer.style.containerType).toBe("size")
    })

    it("exposes --mario-cell-size with the resolved numeric cell size", () => {
      const { container } = render(
        <TilegridScrollRoot<Tile> items={items} cellSize={100} gap={8}>
          <span>child</span>
        </TilegridScrollRoot>,
      )
      const outer = container.firstElementChild as HTMLElement
      expect(outer.style.getPropertyValue("--mario-cell-size")).toBe("100px")
    })

    it("exposes --mario-cell-size verbatim when cellSize is a CSS expression", () => {
      const { container } = render(
        <TilegridScrollRoot<Tile> items={items} cellSize="6rem" gap={8}>
          <span>child</span>
        </TilegridScrollRoot>,
      )
      const outer = container.firstElementChild as HTMLElement
      expect(outer.style.getPropertyValue("--mario-cell-size")).toBe("6rem")
    })

    it("keeps overflow-x: hidden so Mario only operates on the block axis", () => {
      const { container } = render(
        <TilegridScrollRoot<Tile> items={items} cellSize={100} gap={8}>
          <span>child</span>
        </TilegridScrollRoot>,
      )
      const outer = container.firstElementChild as HTMLElement
      expect(outer.style.overflowY).toBe("auto")
      expect(outer.style.overflowX).toBe("hidden")
    })

    it("defaults to overflows=false (paddingBlock unset) when the container has no measured size", () => {
      // happy-dom + mocked ResizeObserver: useContainerSize observes nothing
      // and width/height stay at 0 → overflow gate stays false → padding 0.
      // This is the regression guard for R3 in the test environment.
      const { container } = render(
        <TilegridScrollRoot<Tile> items={items} cellSize={100} gap={8}>
          <span>child</span>
        </TilegridScrollRoot>,
      )
      const outer = container.firstElementChild as HTMLElement
      const grid = outer.firstElementChild?.nextElementSibling
        ? (outer.firstElementChild?.nextElementSibling as HTMLElement)
        : (outer.firstElementChild as HTMLElement)
      // Padding is `0` (unitless) when overflows=false.
      expect(grid.style.paddingBlock).toBe("0")
      expect(outer.getAttribute("data-mario-overflows")).toBeNull()
    })
  })
})
