/**
 * Focus retention keeps spatial-navigation surfaces from falling into a
 * focus vacuum. When the browser blurs a retained tile/button back to
 * <body>/<html> without focusing another meaningful element, the helper
 * restores the last non-editable spatial focus target.
 *
 * This is deliberately framework-free and lifecycle-owned by
 * startSpatialNavigation(). Components remain native HTML and do not opt in.
 */

export interface FocusRetentionOptions {
  /** DOM root to observe. Defaults to document. */
  readonly target?: Document | HTMLElement
  /** Schedule the settled-focus check. Defaults to queueMicrotask. */
  readonly schedule?: (restore: () => void) => void
}

export interface FocusRetention {
  dispose(): void
}

const FOCUSABLE_SELECTOR =
  "a, button, input, select, textarea, [tabindex]:not([tabindex='-1'])"

export function createFocusRetention(
  options: FocusRetentionOptions = {},
): FocusRetention {
  const target =
    options.target ?? (typeof document !== "undefined" ? document : null)
  const schedule =
    options.schedule ?? ((restore: () => void) => queueMicrotask(restore))

  if (!target) return { dispose: () => {} }

  let disposed = false
  let generation = 0
  let lastRetainable: HTMLElement | null = null

  const cancelPending = () => {
    generation += 1
  }

  const onFocusIn = (event: Event) => {
    const target = asHTMLElement(event.target)
    if (isRetainableFocusTarget(target)) {
      lastRetainable = target
    }
    cancelPending()
  }

  const onFocusOut = (event: Event) => {
    const blurred = asHTMLElement(event.target)
    if (!lastRetainable || blurred !== lastRetainable) return

    const token = generation
    const retained = lastRetainable
    schedule(() => {
      if (disposed || token !== generation) return
      if (!retained.isConnected || !isRetainableFocusTarget(retained)) return

      const active = asHTMLElement(document.activeElement)
      if (isMeaningfulFocusTarget(active)) return

      retained.focus({ preventScroll: true })
    })
  }

  target.addEventListener("focusin", onFocusIn, true)
  target.addEventListener("focusout", onFocusOut, true)

  return {
    dispose() {
      disposed = true
      cancelPending()
      target.removeEventListener("focusin", onFocusIn, true)
      target.removeEventListener("focusout", onFocusOut, true)
      lastRetainable = null
    },
  }
}

function asHTMLElement(value: unknown): HTMLElement | null {
  return value instanceof HTMLElement ? value : null
}

function isMeaningfulFocusTarget(el: HTMLElement | null): el is HTMLElement {
  return !!el && el !== document.body && el !== document.documentElement
}

function isRetainableFocusTarget(el: HTMLElement | null): el is HTMLElement {
  if (!el) return false
  if (!el.isConnected) return false
  if (!el.matches(FOCUSABLE_SELECTOR)) return false
  if (el.matches(":disabled")) return false
  if (isEditableElement(el)) return false
  if (el.getAttribute("tabindex") === "-1") return false
  if (el.closest(".lrud-ignore")) return false
  return true
}

function isEditableElement(el: HTMLElement): boolean {
  const tag = el.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
  if (el.isContentEditable) return true
  return el.closest("[contenteditable='true'], [contenteditable='']") !== null
}
