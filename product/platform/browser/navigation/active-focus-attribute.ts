/**
 * Active-focus attribute mirrors DOM focus into an explicit data attribute.
 *
 * Most browsers paint `:focus` for programmatic focus, but embedded webviews
 * can be inconsistent. The attribute gives themed surfaces a deterministic
 * selector for the currently focused native element without coupling React
 * components to the navigation engine.
 */

export interface ActiveFocusAttributeOptions {
  /** DOM root to observe. Defaults to document. */
  readonly target?: Document | HTMLElement
}

export interface ActiveFocusAttribute {
  dispose(): void
}

export const ACTIVE_FOCUS_ATTRIBUTE = "data-korri-active-focus"

export function createActiveFocusAttribute(
  options: ActiveFocusAttributeOptions = {},
): ActiveFocusAttribute {
  const target =
    options.target ?? (typeof document !== "undefined" ? document : null)

  if (!target) return { dispose: () => {} }

  let current: HTMLElement | null = null

  const clearCurrent = () => {
    current?.removeAttribute(ACTIVE_FOCUS_ATTRIBUTE)
    current = null
  }

  const mark = (next: HTMLElement | null) => {
    if (current === next) return
    clearCurrent()
    if (!isMeaningfulFocusTarget(next)) return
    next.setAttribute(ACTIVE_FOCUS_ATTRIBUTE, "")
    current = next
  }

  const onFocusIn = (event: Event) => {
    mark(asHTMLElement(event.target))
  }

  const onFocusOut = (event: Event) => {
    const blurred = asHTMLElement(event.target)
    if (!current || blurred !== current) return

    queueMicrotask(() => {
      if (document.activeElement === current) return
      clearCurrent()
    })
  }

  target.addEventListener("focusin", onFocusIn, true)
  target.addEventListener("focusout", onFocusOut, true)
  mark(asHTMLElement(document.activeElement))

  return {
    dispose() {
      target.removeEventListener("focusin", onFocusIn, true)
      target.removeEventListener("focusout", onFocusOut, true)
      clearCurrent()
    },
  }
}

function asHTMLElement(value: unknown): HTMLElement | null {
  return value instanceof HTMLElement ? value : null
}

function isMeaningfulFocusTarget(el: HTMLElement | null): el is HTMLElement {
  return !!el && el !== document.body && el !== document.documentElement
}
