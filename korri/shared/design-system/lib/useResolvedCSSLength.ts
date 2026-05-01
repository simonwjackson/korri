import { type RefObject, useEffect, useRef, useState } from "react"

export interface ResolvedCSSLength {
  /**
   * Resolved pixel value.
   *
   * - For a numeric input, this is the input itself, returned synchronously.
   * - For a string input, this is `null` until the sentinel element is mounted
   *   and measured by the internal ResizeObserver. Subsequent layout-affecting
   *   CSS changes (theme switch, root font-size, viewport resize, etc.) drive
   *   further updates as the observer fires.
   */
  resolvedPx: number | null
  /**
   * CSS expression to embed in inline styles.
   *
   * - Numeric input → `${value}px`
   * - String input → the input string, verbatim
   */
  cssValue: string
  /**
   * Ref to attach to the sentinel element. Only meaningful when the input is
   * a string; numeric inputs never read this ref. Consumers should mount a
   * hidden DOM node sized to `cssValue` (e.g. `width: cssValue`) and bind
   * this ref to it.
   */
  ref: RefObject<HTMLElement | null>
}

/**
 * Resolve a CSS length to pixels, live.
 *
 * Numeric inputs short-circuit: the value is returned directly with no DOM
 * sentinel, no ResizeObserver, and no effect work — they remain zero-cost.
 *
 * String inputs (any valid CSS `<length>` — `rem`, `em`, `vw`, `vh`, `%`,
 * `var(...)`, `calc(...)`, etc.) require the consumer to render a hidden
 * sentinel inside the component tree, sized to `cssValue`, with `ref` bound
 * to it. Mounting the sentinel inside the component preserves the cascade
 * so theme variables and font-size on intermediate ancestors resolve
 * correctly. The ResizeObserver re-derives `resolvedPx` whenever the
 * sentinel's measured width changes.
 *
 * Pre-resolution behavior: when `value` is a string and the sentinel has
 * not yet been measured, `resolvedPx` is `null`. Callers should treat this
 * as a "not yet known" signal (e.g., fall back to a single-column layout)
 * rather than coercing it to 0.
 */
export function useResolvedCSSLength(
  value: number | string,
): ResolvedCSSLength {
  const ref = useRef<HTMLElement | null>(null)
  const isNumber = typeof value === "number"
  const [stringResolvedPx, setStringResolvedPx] = useState<number | null>(null)

  useEffect(() => {
    if (isNumber) return

    const element = ref.current
    if (!element) return

    const update = () => {
      setStringResolvedPx(element.getBoundingClientRect().width)
    }
    update()

    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
    // The observer reports CSS-driven width changes automatically, so the
    // effect does not need to re-run when the input string changes value.
  }, [isNumber])

  const resolvedPx = isNumber ? value : stringResolvedPx
  const cssValue = isNumber ? `${value}px` : value

  return { resolvedPx, cssValue, ref }
}
