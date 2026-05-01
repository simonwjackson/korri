import { describe, expect, it, mock } from "bun:test"
import { fireEvent, render } from "@testing-library/react"
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
  it("renders one button per item with the consumer's visual output as children", () => {
    const items: Tile[] = [{ id: "a" }, { id: "b" }, { id: "c" }]
    const { container } = render(
      wrap(
        baseCtx({ items }),
        <TilegridCells<Tile>
          renderCell={({ cellProps, item }) => (
            <button {...cellProps}>
              <span data-testid={`vis-${item.id}`}>{item.id}</span>
            </button>
          )}
        />,
      ),
    )
    const buttons = container.querySelectorAll("button")
    expect(buttons.length).toBe(3)
    expect(buttons[0]?.getAttribute("aria-label")).toBe("a")
    expect(buttons[0]?.getAttribute("data-tile-id")).toBe("a")
    expect(buttons[0]?.getAttribute("type")).toBe("button")
    expect(buttons[0]?.querySelector('[data-testid="vis-a"]')).toBeTruthy()
  })

  it("passes item by reference to renderCell", () => {
    const item: Tile = { id: "a" }
    let received: Tile | undefined
    render(
      wrap(
        baseCtx({ items: [item] }),
        <TilegridCells<Tile>
          renderCell={({ cellProps, item }) => {
            received = item
            return <button {...cellProps}>{item.id}</button>
          }}
        />,
      ),
    )
    expect(received).toBe(item)
  })

  it("supports a custom element when the consumer spreads cellProps", () => {
    const items: Tile[] = [{ id: "custom" }]
    const { container } = render(
      wrap(
        baseCtx({ items }),
        <TilegridCells<Tile>
          renderCell={({ cellProps, item }) => (
            <section {...cellProps}>{item.id}</section>
          )}
        />,
      ),
    )
    const cell = container.querySelector('[data-tile-id="custom"]')
    expect(cell?.tagName).toBe("SECTION")
    expect(cell?.getAttribute("aria-label")).toBe("custom")
    expect((cell as HTMLElement | null)?.style.gridColumn).toBe("span 1")
  })

  it("lets consumer props win when applied after cellProps", () => {
    const items: Tile[] = [{ id: "a" }]
    const { container } = render(
      wrap(
        baseCtx({ items }),
        <TilegridCells<Tile>
          renderCell={({ cellProps }) => (
            <button {...cellProps} aria-label="Override">
              child
            </button>
          )}
        />,
      ),
    )
    expect(container.querySelector("button")?.getAttribute("aria-label")).toBe(
      "Override",
    )
  })

  it("applies span styles for span:1 by default", () => {
    const items: Tile[] = [{ id: "x" }]
    const { container } = render(
      wrap(
        baseCtx({ items }),
        <TilegridCells<Tile>
          renderCell={({ cellProps, item }) => (
            <button {...cellProps}>{item.id}</button>
          )}
        />,
      ),
    )
    const button = container.querySelector("button")
    expect(button?.style.gridColumn).toBe("span 1")
    expect(button?.style.gridRow).toBe("span 1")
  })

  it("applies span styles for span:2 items", () => {
    const items: Tile[] = [{ id: "hero", span: 2 }]
    const { container } = render(
      wrap(
        baseCtx({ items }),
        <TilegridCells<Tile>
          renderCell={({ cellProps, item }) => (
            <button {...cellProps}>{item.id}</button>
          )}
        />,
      ),
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
        <TilegridCells<Tile>
          renderCell={({ cellProps, item }) => (
            <button {...cellProps}>{item.id}</button>
          )}
        />,
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
        <TilegridCells<Tile>
          renderCell={({ cellProps, item }) => (
            <button {...cellProps}>{item.id}</button>
          )}
        />,
      ),
    )
    const button = container.querySelector("button")
    expect(button?.style.gridColumn).toBe("span 2")
    expect(button?.style.gridRow).toBe("span 2")
  })

  it("renders zero cells for an empty items array", () => {
    const { container } = render(
      wrap(
        baseCtx({ items: [] }),
        <TilegridCells<Tile>
          renderCell={({ cellProps, item }) => (
            <button {...cellProps}>{item.id}</button>
          )}
        />,
      ),
    )
    expect(container.querySelectorAll("button").length).toBe(0)
  })

  it("skips an item when renderCell returns null", () => {
    const items: Tile[] = [{ id: "a" }, { id: "b" }]
    const { container } = render(
      wrap(
        baseCtx({ items }),
        <TilegridCells<Tile>
          renderCell={({ cellProps, item }) =>
            item.id === "a" ? null : <button {...cellProps}>{item.id}</button>
          }
        />,
      ),
    )
    const buttons = container.querySelectorAll("button")
    expect(buttons.length).toBe(1)
    expect(buttons[0]?.textContent).toBe("b")
  })

  it("uses getAriaLabel from context to label each cell", () => {
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
        <TilegridCells<NamedTile>
          renderCell={({ cellProps, item }) => (
            <button {...cellProps}>{item.label}</button>
          )}
        />
      </TilegridProvider>,
    )
    const buttons = container.querySelectorAll("button")
    expect(buttons[0]?.getAttribute("aria-label")).toBe("First")
    expect(buttons[1]?.getAttribute("aria-label")).toBe("Second")
  })

  it("invokes onItemClick when a consumer spreads cellProps.onClick", () => {
    const item: Tile = { id: "click-me" }
    const onItemClick = mock(() => undefined)
    const { container } = render(
      wrap(
        baseCtx({ items: [item] }),
        <TilegridCells<Tile>
          onItemClick={onItemClick}
          renderCell={({ cellProps, item }) => (
            <button {...cellProps}>{item.id}</button>
          )}
        />,
      ),
    )

    const button = container.querySelector("button")
    expect(button?.style.cursor).toBe("pointer")
    if (!button) throw new Error("button not rendered")
    fireEvent.click(button)
    expect(onItemClick).toHaveBeenCalledTimes(1)
    expect(onItemClick).toHaveBeenCalledWith(item)
  })

  it("throws when rendered outside a Tilegrid Root", () => {
    expect(() =>
      render(
        <TilegridCells<Tile>
          renderCell={({ cellProps, item }) => (
            <button {...cellProps}>{item.id}</button>
          )}
        />,
      ),
    ).toThrow(/must be used within a TilegridScrollRoot or TilegridPagedRoot/)
  })
})
