/**
 * Pure layout math for the paged Tilegrid Root.
 *
 * Given a list of items (some with multi-cell spans) and a uniform-cell grid
 * layout, returns an array of pages where each page is a list of items that
 * fit. Items are placed top-to-bottom, left-to-right; an item that doesn't
 * fit on the current page starts a new page. Spans larger than
 * `min(columns, rows)` are clamped.
 *
 * Scroll mode does not call this — it relies on CSS `grid-auto-flow: dense`
 * to do equivalent first-fit packing without page boundaries. Paged mode
 * needs this because it must chunk items into discrete page sets.
 *
 * Ported verbatim from product/themes/shift/organisms/grid-view-pagination.ts;
 * the characterization spec lives in bin-pack.test.ts.
 */

export interface GridItemShape {
  id: string
  span?: number
}

export interface PaginateItemsInput<T extends GridItemShape> {
  items: ReadonlyArray<T>
  columns: number
  rows: number
}

export interface PaginateItemsResult<T extends GridItemShape> {
  pages: T[][]
  totalPages: number
}

export function paginateItems<T extends GridItemShape>({
  items,
  columns,
  rows,
}: PaginateItemsInput<T>): PaginateItemsResult<T> {
  const cols = Math.max(0, Math.floor(columns))
  const rws = Math.max(0, Math.floor(rows))

  if (cols === 0 || rws === 0) {
    return { pages: [[]], totalPages: 1 }
  }

  const maxSpan = Math.min(cols, rws)
  const pages: T[][] = []
  let currentPage: T[] = []
  let occupied = makeGrid(cols, rws)

  const findNext = (): { row: number; col: number } | null => {
    for (let r = 0; r < rws; r++) {
      for (let c = 0; c < cols; c++) {
        if (!occupied[r]?.[c]) return { row: r, col: c }
      }
    }
    return null
  }

  const canPlace = (row: number, col: number, span: number): boolean => {
    if (row + span > rws || col + span > cols) return false
    for (let r = row; r < row + span; r++) {
      for (let c = col; c < col + span; c++) {
        if (occupied[r]?.[c]) return false
      }
    }
    return true
  }

  const place = (row: number, col: number, span: number) => {
    for (let r = row; r < row + span; r++) {
      const rowArr = occupied[r]
      if (!rowArr) continue
      for (let c = col; c < col + span; c++) rowArr[c] = true
    }
  }

  for (const item of items) {
    const span = Math.min(Math.max(1, Math.floor(item.span ?? 1)), maxSpan)

    let placed = false
    let position = findNext()
    while (position && !placed) {
      if (canPlace(position.row, position.col, span)) {
        place(position.row, position.col, span)
        currentPage.push(item)
        placed = true
      } else {
        const rowArr = occupied[position.row]
        if (rowArr) rowArr[position.col] = true
        position = findNext()
      }
    }

    if (!placed) {
      if (currentPage.length > 0) {
        pages.push(currentPage)
        currentPage = []
        occupied = makeGrid(cols, rws)
      }
      if (canPlace(0, 0, span)) {
        place(0, 0, span)
        currentPage.push(item)
      }
    }
  }

  if (currentPage.length > 0) pages.push(currentPage)
  if (pages.length === 0) pages.push([])

  return { pages, totalPages: pages.length }
}

function makeGrid(columns: number, rows: number): boolean[][] {
  const out: boolean[][] = []
  for (let r = 0; r < rows; r++) {
    const row: boolean[] = []
    for (let c = 0; c < columns; c++) row.push(false)
    out.push(row)
  }
  return out
}
