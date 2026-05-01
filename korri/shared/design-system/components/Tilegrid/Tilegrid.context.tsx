import { createContext, useContext } from "react"

/**
 * Tilegrid: a flexible, performant, theme- and domain-agnostic grid primitive.
 *
 * Architecture (per the project React skill):
 *   - Two sibling Roots share a base context and add mode-specific extensions:
 *       TilegridScrollRoot   → publishes BaseContext (no extension).
 *       TilegridPagedRoot    → publishes BaseContext + PagedExtension.
 *   - Cells render through a single atom (TilegridCells) that consumes the
 *     context and renders native <button aria-label> elements with consumer-
 *     supplied visual children.
 *   - There is no boolean prop selecting mode. Mode is a composition choice.
 *   - This context owns no state. Roots create their own state and publish it.
 *
 * The context is generic over T, where T must satisfy GridItemShape (it must
 * carry a string `id` and may carry a numeric `span`). The context value uses
 * an opaque shape at the React-context level because React contexts are not
 * natively generic; the typed surface is exposed via the `useTilegrid<T>()`
 * hook below, which casts on read.
 */

/** Public shape an item must satisfy to participate in the grid. */
export interface GridItemShape {
  id: string
  span?: number
}

/** Base context shared by both Roots. */
export interface TilegridBaseContext<T extends GridItemShape> {
  /**
   * Items to render *for the current view*. In scroll mode this is the full
   * input list. In paged mode this is the current page's items, already
   * computed by the bin-packer.
   */
  readonly items: ReadonlyArray<T>
  /** Stable React key for an item. Defaults to `item.id`. */
  readonly getKey: (item: T) => string
  /**
   * Span resolver. Returns the integer span for an item before clamping.
   * Defaults to `item.span ?? 1`.
   */
  readonly getSpan: (item: T) => number
  /** Aria-label resolver for the cell button. Defaults to `item.id`. */
  readonly getAriaLabel: (item: T) => string
  /** Cell base size in CSS pixels. */
  readonly cellSize: number
  /** Gap between cells in CSS pixels. */
  readonly gap: number
  /** Number of columns the layout currently has (derived from container). */
  readonly columns: number
  /**
   * Maximum span permitted per dimension, given the current layout.
   * Scroll mode uses `{ columns, rows: Infinity }`; paged mode uses the
   * derived `{ columns, rows }`.
   */
  readonly maxSpan: { columns: number; rows: number }
}

/** Paged Root extension. Scroll Root does not publish these fields. */
export interface TilegridPagedExtension {
  readonly currentPage: number
  readonly totalPages: number
  readonly next: () => void
  readonly prev: () => void
  readonly goToPage: (page: number) => void
}

/**
 * Internal context value. The runtime type is intentionally untyped at the
 * React-context layer; `useTilegrid<T>()` re-asserts the generic on read.
 * Roots that publish only the base context store `paged: undefined`.
 */
interface TilegridContextValue {
  readonly base: TilegridBaseContext<GridItemShape>
  readonly paged?: TilegridPagedExtension
}

const TilegridCtx = createContext<TilegridContextValue | null>(null)

/** Provider used by both Roots. */
export const TilegridProvider = TilegridCtx.Provider

/**
 * Read the Tilegrid context. Throws if used outside a Tilegrid Root.
 *
 * The generic parameter is a convenience cast — the runtime carries the same
 * shape the Root supplied. Consumers are responsible for picking T compatibly
 * with how their Root was instantiated.
 */
export function useTilegrid<T extends GridItemShape>(): {
  base: TilegridBaseContext<T>
  paged?: TilegridPagedExtension
} {
  const ctx = useContext(TilegridCtx)
  if (!ctx) {
    throw new Error(
      "useTilegrid must be used within a TilegridScrollRoot or TilegridPagedRoot",
    )
  }
  // The runtime context value is the same shape the Root supplied; the
  // generic re-assertion is a convenience cast that requires going through
  // `unknown` because `T` cannot be inferred from `GridItemShape` alone.
  return ctx as unknown as {
    base: TilegridBaseContext<T>
    paged?: TilegridPagedExtension
  }
}

/**
 * Clamp an integer span to fit the current layout.
 *
 * - Span is floored, then min-bounded by 1 (no zero or negative spans).
 * - Then max-bounded by `maxSpan.columns` and `maxSpan.rows`.
 * - Used by Roots before placement and by TilegridCells before applying
 *   `gridColumn` / `gridRow` styles.
 */
export function clampSpan(
  rawSpan: number,
  maxSpan: { columns: number; rows: number },
): number {
  const floored = Math.max(1, Math.floor(rawSpan))
  return Math.min(floored, maxSpan.columns, maxSpan.rows)
}
