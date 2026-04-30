/**
 * Pure pagination math for FeaturedGameGrid.
 *
 * The grid renders a featured 2x2 card on page 1 (when 2+ columns and 2+ rows
 * are available), followed by single-cell cards. Subsequent pages show only
 * single-cell cards.
 */

export interface GridLayout {
  columns: number
  rows: number
}

export interface FeaturedGridPage {
  /** Index into the original games array; null when no featured game is shown. */
  featuredIndex: number | null
  /** Indices into the original games array for single-cell cards on this page. */
  otherIndices: number[]
}

export interface FeaturedGridPagination {
  pages: FeaturedGridPage[]
  totalPages: number
  canShowFeatured: boolean
}

export function paginateFeaturedGrid(
  numGames: number,
  layout: GridLayout,
): FeaturedGridPagination {
  const columns = Math.max(0, Math.floor(layout.columns))
  const rows = Math.max(0, Math.floor(layout.rows))
  const cells = columns * rows

  if (cells === 0 || numGames === 0) {
    return {
      pages: [{ featuredIndex: null, otherIndices: [] }],
      totalPages: 1,
      canShowFeatured: false,
    }
  }

  const canShowFeatured = columns >= 2 && rows >= 2 && numGames > 0
  const featuredCells = 4
  const firstPageOtherCapacity = canShowFeatured ? cells - featuredCells : cells
  const regularPageCapacity = cells

  const pages: FeaturedGridPage[] = []

  if (canShowFeatured) {
    const firstPageOthers = Math.min(firstPageOtherCapacity, numGames - 1)
    const otherIndices = range(1, firstPageOthers + 1)
    pages.push({ featuredIndex: 0, otherIndices })
  } else {
    const firstPageCount = Math.min(regularPageCapacity, numGames)
    pages.push({ featuredIndex: null, otherIndices: range(0, firstPageCount) })
  }

  const consumedAfterFirst = canShowFeatured
    ? 1 + Math.min(firstPageOtherCapacity, Math.max(0, numGames - 1))
    : Math.min(regularPageCapacity, numGames)

  let consumed = consumedAfterFirst
  while (consumed < numGames) {
    const remaining = numGames - consumed
    const pageCount = Math.min(regularPageCapacity, remaining)
    pages.push({
      featuredIndex: null,
      otherIndices: range(consumed, consumed + pageCount),
    })
    consumed += pageCount
  }

  return { pages, totalPages: pages.length, canShowFeatured }
}

function range(start: number, end: number): number[] {
  const out: number[] = []
  for (let i = start; i < end; i++) out.push(i)
  return out
}
