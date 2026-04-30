import { describe, expect, it } from "bun:test"
import { paginateFeaturedGrid } from "./featured-grid-pagination"

describe("paginateFeaturedGrid", () => {
  it("returns one empty page when there are no games", () => {
    const result = paginateFeaturedGrid(0, { columns: 4, rows: 2 })
    expect(result.totalPages).toBe(1)
    expect(result.canShowFeatured).toBe(false)
    expect(result.pages[0]).toEqual({ featuredIndex: null, otherIndices: [] })
  })

  it("returns one empty page when the layout has zero cells", () => {
    const result = paginateFeaturedGrid(20, { columns: 0, rows: 5 })
    expect(result.totalPages).toBe(1)
    expect(result.canShowFeatured).toBe(false)
    expect(result.pages[0]).toEqual({ featuredIndex: null, otherIndices: [] })
  })

  it("shows featured + remaining games on a single page when they all fit", () => {
    // 4 cols x 2 rows = 8 cells; featured takes 4; up to 4 single-cell games.
    // 5 games total → page 1 holds featured (idx 0) + 4 others (idx 1..4).
    const result = paginateFeaturedGrid(5, { columns: 4, rows: 2 })
    expect(result.totalPages).toBe(1)
    expect(result.canShowFeatured).toBe(true)
    expect(result.pages[0]).toEqual({
      featuredIndex: 0,
      otherIndices: [1, 2, 3, 4],
    })
  })

  it("paginates 24 games across 4x2 cells with featured", () => {
    // Page 1: 1 featured + 4 others → consumes 5 games (idx 0..4)
    // Page 2: 8 games (idx 5..12)
    // Page 3: 8 games (idx 13..20)
    // Page 4: 3 games (idx 21..23)
    const result = paginateFeaturedGrid(24, { columns: 4, rows: 2 })
    expect(result.totalPages).toBe(4)
    expect(result.canShowFeatured).toBe(true)
    expect(result.pages[0]).toEqual({
      featuredIndex: 0,
      otherIndices: [1, 2, 3, 4],
    })
    expect(result.pages[1]?.featuredIndex).toBe(null)
    expect(result.pages[1]?.otherIndices.length).toBe(8)
    expect(result.pages[1]?.otherIndices[0]).toBe(5)
    expect(result.pages[3]?.otherIndices).toEqual([21, 22, 23])
  })

  it("suppresses featured when the layout is too small (1 row)", () => {
    // 4 cols x 1 row → cells=4. Featured suppressed (rows<2). 10 games → 3 pages.
    const result = paginateFeaturedGrid(10, { columns: 4, rows: 1 })
    expect(result.canShowFeatured).toBe(false)
    expect(result.pages[0]).toEqual({
      featuredIndex: null,
      otherIndices: [0, 1, 2, 3],
    })
    expect(result.totalPages).toBe(3)
    expect(result.pages[2]?.otherIndices).toEqual([8, 9])
  })

  it("suppresses featured when the layout is too small (1 column)", () => {
    const result = paginateFeaturedGrid(6, { columns: 1, rows: 4 })
    expect(result.canShowFeatured).toBe(false)
    expect(result.totalPages).toBe(2)
    expect(result.pages[0]?.otherIndices).toEqual([0, 1, 2, 3])
    expect(result.pages[1]?.otherIndices).toEqual([4, 5])
  })

  it("handles a single game with featured layout", () => {
    const result = paginateFeaturedGrid(1, { columns: 4, rows: 2 })
    expect(result.totalPages).toBe(1)
    expect(result.canShowFeatured).toBe(true)
    expect(result.pages[0]).toEqual({ featuredIndex: 0, otherIndices: [] })
  })

  it("handles a single game with non-featured layout", () => {
    const result = paginateFeaturedGrid(1, { columns: 4, rows: 1 })
    expect(result.totalPages).toBe(1)
    expect(result.canShowFeatured).toBe(false)
    expect(result.pages[0]).toEqual({ featuredIndex: null, otherIndices: [0] })
  })

  it("floors fractional column/row inputs", () => {
    const result = paginateFeaturedGrid(4, { columns: 2.9, rows: 2.5 })
    // Floored to 2x2 = 4 cells; featured fills the page on its own.
    // Page 1: featured idx 0 + 0 others. Remaining 3 games on page 2.
    expect(result.canShowFeatured).toBe(true)
    expect(result.totalPages).toBe(2)
    expect(result.pages[0]).toEqual({ featuredIndex: 0, otherIndices: [] })
    expect(result.pages[1]?.otherIndices).toEqual([1, 2, 3])
  })
})
