import type { Direction, InputAction } from "@platform/input/types"
import {
  centerScrollableAncestors,
  hasMarioCameraAncestor,
} from "./center-scroll"

/**
 * Focus engine: turns InputActions into DOM focus changes.
 *
 * Coupling boundaries:
 *   - The engine knows about the DOM. (It calls .focus() and .click().)
 *   - The engine does NOT know about React, the router, or any component.
 *   - The engine does NOT know about LRUD specifically; the spatial algorithm
 *     is injected as `nextFocus`. Swap implementations freely.
 *
 * Components stay native: <a>, <button>, <input>, [tabindex]. No imports here
 * touch component code.
 */

export type NextFocusFn = (
  current: Element | null,
  direction: Direction,
  scope?: HTMLElement,
) => HTMLElement | null

export interface FocusEngineOptions {
  /** Spatial-navigation algorithm. Required. */
  readonly nextFocus: NextFocusFn
  /** Optional dynamic scope (e.g. modal root, current route container). */
  readonly scope?: () => HTMLElement | null | undefined
  /** Override "confirm". Default: invoke .click() on the focused element. */
  readonly onConfirm?: (target: HTMLElement | null) => void
  /** Handle "back". Default: no-op (consumers usually wire this to router). */
  readonly onBack?: () => void
  /** Handle "options". Default: no-op. */
  readonly onOptions?: (target: HTMLElement | null) => void
  /** Handle "menu". Default: no-op. */
  readonly onMenu?: () => void
  /**
   * Selector for the initial focus when nothing is focused yet. Defaults to
   * the first native focusable inside the scope.
   */
  readonly initialFocusSelector?: string
}

const DEFAULT_INITIAL_FOCUS_SELECTOR =
  "a, button, input, select, textarea, [tabindex]:not([tabindex='-1'])"

export interface FocusEngine {
  handle(action: InputAction): void
}

export function createFocusEngine(opts: FocusEngineOptions): FocusEngine {
  const initialSelector =
    opts.initialFocusSelector ?? DEFAULT_INITIAL_FOCUS_SELECTOR

  const resolveScope = (): HTMLElement | undefined => {
    const scope = opts.scope?.()
    return scope ?? undefined
  }

  const focusInitial = (scope: HTMLElement | undefined) => {
    const root: ParentNode = scope ?? document
    const initial = root.querySelector<HTMLElement>(initialSelector)
    initial?.focus()
  }

  return {
    handle(action) {
      const active = document.activeElement as HTMLElement | null
      const focused = isMeaningfulFocusTarget(active) ? active : null

      switch (action.type) {
        case "direction": {
          const scope = resolveScope()
          if (!focused || !isInsideScope(focused, scope)) {
            focusInitial(scope)
            return
          }
          const next = opts.nextFocus(focused, action.direction, scope)
          if (!next) return
          // preventScroll: true so the browser's default focus-scroll cannot
          // race the rAF tween (Mario surfaces) or layer over the explicit
          // scrollIntoView (non-Mario surfaces). The engine is the sole
          // owner of post-focus scroll behavior.
          next.focus({ preventScroll: true })
          if (hasMarioCameraAncestor(next)) {
            centerScrollableAncestors(next, { animate: true })
          } else {
            next.scrollIntoView({ block: "nearest", inline: "nearest" })
          }
          return
        }
        case "confirm": {
          if (opts.onConfirm) {
            opts.onConfirm(focused)
            return
          }
          if (focused && typeof focused.click === "function") focused.click()
          return
        }
        case "back": {
          opts.onBack?.()
          return
        }
        case "options": {
          opts.onOptions?.(focused)
          return
        }
        case "menu": {
          opts.onMenu?.()
          return
        }
      }
    },
  }
}

function isInsideScope(el: Element, scope: HTMLElement | undefined): boolean {
  if (!scope) return true
  return scope === el || scope.contains(el)
}

function isMeaningfulFocusTarget(el: HTMLElement | null): el is HTMLElement {
  return !!el && el !== document.body && el !== document.documentElement
}
