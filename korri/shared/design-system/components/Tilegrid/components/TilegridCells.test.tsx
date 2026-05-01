import { describe, expect, it } from "bun:test"
import { render } from "@testing-library/react"
import {
  type GridItemShape,
  type TilegridBaseContext,
  TilegridProvider,
} from "../Tilegrid.context"
import { TilegridCells } from "./TilegridCells"

interface Tile extends GridItemShape {
  id: string
  span?: number
}

const baseCtx = (
  overrides: Partial<TilegridBaseContext<Tile>> = {},
): TilegridBaseContext<Tile> => ({
  items: [],
  getKey: t => t.id,
  getSpan: t => t.span ?? 1,
  getAriaLabel: t => t.id,
  cellSize: 100,
  gap: 8,
  columns: 4,
  maxSpan: { columns: 4, rows: Infinity },
  ...overrides,
})

const wrap = (ctx: TilegridBaseContext<Tile>, ui: React.ReactElement) => (
  <TilegridProvider
    value={{
      base: ctx as unknown as TilegridBaseContext<GridItemShape>,
      paged: undefined,
    }}
  >
    {ui}
  </TilegridProvider>
)

describe("TilegridCells", () => {
  it("renders one button per item with the consumer's render output as children", () => {
    const items: Tile[] = [{ id: "a" }, { id: "b" }, { id: "c" }]
    const { container } = render(
      wrap(
        baseCtx({ items }),
        <TilegridCells<Tile>
          render={t => <span data-testid={`vis-${t.id}`}>{t.id}</span>}
        />,
      ),
    )
    const buttons = container.querySelectorAll("button")
    expect(buttons.length).toBe(3)
    expect(buttons[0]?.getAttribute("aria-label")).toBe("a")
    expect(buttons[0]?.querySelector('[data-testid="vis-a"]')).toBeTruthy()
  })

  it("applies span styles for span:1 by default", () => {
    const items: Tile[] = [{ id: "x" }]
    const { container } = render(
      wrap(baseCtx({ items }), <TilegridCells<Tile> render={t => t.id} />),
    )
    const button = container.querySelector("button")
    expect(button?.style.gridColumn).toBe("span 1")
    expect(button?.style.gridRow).toBe("span 1")
  })

  it("applies span styles for span:2 items", () => {
    const items: Tile[] = [{ id: "hero", span: 2 }]
    const { container } = render(
      wrap(baseCtx({ items }), <TilegridCells<Tile> render={t => t.id} />),
    )
    const button = container.querySelector("button")
    expect(button?.style.gridColumn).toBe("span 2")
    expect(button?.style.gridRow).toBe("span 2")
  })

  it("clamps spans larger than maxSpan.columns", () => {
    const items: Tile[] = [{ id: "huge", span: 99 }]
    const { container } = render(
      wrap(
        baseCtx({ items, columns: 4, maxSpan: { columns: 4, rows: Infinity } }),
        <TilegridCells<Tile> render={t => t.id} />,
      ),
    )
    const button = container.querySelector("button")
    expect(button?.style.gridColumn).toBe("span 4")
    expect(button?.style.gridRow).toBe("span 4")
  })

  it("clamps spans larger than maxSpan.rows (paged-mode case)", () => {
    const items: Tile[] = [{ id: "huge", span: 99 }]
    const { container } = render(
      wrap(
        baseCtx({ items, columns: 8, maxSpan: { columns: 8, rows: 2 } }),
        <TilegridCells<Tile> render={t => t.id} />,
      ),
    )
    const button = container.querySelector("button")
    expect(button?.style.gridColumn).toBe("span 2")
    expect(button?.style.gridRow).toBe("span 2")
  })

  it("renders zero buttons for an empty items array", () => {
    const { container } = render(
      wrap(baseCtx({ items: [] }), <TilegridCells<Tile> render={t => t.id} />),
    )
    expect(container.querySelectorAll("button").length).toBe(0)
  })

  it("uses getAriaLabel from context to label each button", () => {
    interface NamedTile extends GridItemShape {
      id: string
      label: string
    }
    const items: NamedTile[] = [
      { id: "1", label: "First" },
      { id: "2", label: "Second" },
    ]
    const namedCtx: TilegridBaseContext<NamedTile> = {
      items,
      getKey: t => t.id,
      getSpan: () => 1,
      getAriaLabel: t => t.label,
      cellSize: 100,
      gap: 8,
      columns: 2,
      maxSpan: { columns: 2, rows: Infinity },
    }
    const { container } = render(
      <TilegridProvider
        value={{
          base: namedCtx as unknown as TilegridBaseContext<GridItemShape>,
          paged: undefined,
        }}
      >
        <TilegridCells<NamedTile> render={t => t.label} />
      </TilegridProvider>,
    )
    const buttons = container.querySelectorAll("button")
    expect(buttons[0]?.getAttribute("aria-label")).toBe("First")
    expect(buttons[1]?.getAttribute("aria-label")).toBe("Second")
  })

  it("throws when rendered outside a Tilegrid Root", () => {
    expect(() => render(<TilegridCells<Tile> render={t => t.id} />)).toThrow(
      /must be used within a TilegridScrollRoot or TilegridPagedRoot/,
    )
  })
})
