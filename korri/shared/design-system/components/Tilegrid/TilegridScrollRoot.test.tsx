import { describe, expect, it } from "bun:test"
import { render } from "@testing-library/react"
import type { GridItemShape } from "./Tilegrid.context"
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
    expect(outer?.firstElementChild?.tagName).toBe("SECTION")
  })
})
