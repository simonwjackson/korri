import { describe, expect, it } from "bun:test"
import { type GridItemShape, paginateItems } from "./grid-view-pagination"

interface Item extends GridItemShape {
  id: string
  span?: number
}

const item = (id: string, span?: number): Item => ({ id, span })

describe("paginateItems", () => {
  it("returns one empty page when columns is zero", () => {
    const result = paginateItems<Item>({
      items: [item("a"), item("b")],
      columns: 0,
      rows: 5,
    })
    expect(result.totalPages).toBe(1)
    expect(result.pages[0]).toEqual([])
  })

  it("returns one empty page when rows is zero", () => {
    const result = paginateItems<Item>({
      items: [item("a")],
      columns: 4,
      rows: 0,
    })
    expect(result.totalPages).toBe(1)
    expect(result.pages[0]).toEqual([])
  })

  it("packs single-span items onto one page when they fit", () => {
    const items = [item("a"), item("b"), item("c"), item("d")]
    const result = paginateItems({ items, columns: 2, rows: 2 })
    expect(result.totalPages).toBe(1)
    expect(result.pages[0]?.map(i => i.id)).toEqual(["a", "b", "c", "d"])
  })

  it("paginates 25 items over 4x3 cells (12/page)", () => {
    const items = Array.from({ length: 25 }, (_, i) => item(`g-${i}`))
    const result = paginateItems({ items, columns: 4, rows: 3 })
    expect(result.totalPages).toBe(3)
    expect(result.pages[0]?.length).toBe(12)
    expect(result.pages[1]?.length).toBe(12)
    expect(result.pages[2]?.length).toBe(1)
  })

  it("places a 2x2 span and packs single-span items around it", () => {
    // 4 cols x 3 rows = 12 cells; one 2x2 takes 4; 8 cells left for 8 singles.
    const items = [
      item("big", 2),
      ...Array.from({ length: 8 }, (_, i) => item(`s-${i}`)),
    ]
    const result = paginateItems({ items, columns: 4, rows: 3 })
    expect(result.totalPages).toBe(1)
    expect(result.pages[0]?.length).toBe(9)
  })

  it("clamps span larger than the smaller grid dimension", () => {
    // 2x2 grid, span=3 → clamped to 2 → fills the page.
    const items = [item("big", 3), item("a"), item("b")]
    const result = paginateItems({ items, columns: 2, rows: 2 })
    // Page 1: big (clamped to 2x2) fills page. a + b spill to page 2.
    expect(result.totalPages).toBe(2)
    expect(result.pages[0]?.map(i => i.id)).toEqual(["big"])
    expect(result.pages[1]?.map(i => i.id)).toEqual(["a", "b"])
  })

  it("handles empty items array", () => {
    const result = paginateItems<Item>({ items: [], columns: 4, rows: 3 })
    expect(result.totalPages).toBe(1)
    expect(result.pages[0]).toEqual([])
  })

  it("rolls items that don't fit on the current page to the next page", () => {
    // 3 cols x 2 rows = 6 cells. Items: 5 singles + one 2x2.
    // First the 5 singles fill 5 cells. Then 2x2 won't fit (only 1 cell left
    // in a non-aligned row/col). Spill 2x2 to page 2.
    const items = [
      ...Array.from({ length: 5 }, (_, i) => item(`s-${i}`)),
      item("big", 2),
    ]
    const result = paginateItems({ items, columns: 3, rows: 2 })
    expect(result.totalPages).toBe(2)
    expect(result.pages[1]?.map(i => i.id)).toEqual(["big"])
  })
})
