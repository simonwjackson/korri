import type { InputBus } from "@platform/input/bus"
import type { InputAction } from "@platform/input/types"
import { createLogger } from "@shared/logger"

const logger = createLogger("navigation")

export type NavigationDiagnosticsLog = (
  fields: Readonly<Record<string, unknown>>,
  message: string,
) => void

export interface NavigationDiagnosticsOptions {
  /** DOM target to observe for focus changes. Defaults to document. */
  readonly target?: Document
  /** Test seam / custom sink. Defaults to @shared/logger info output. */
  readonly log?: NavigationDiagnosticsLog
  /**
   * Pointer movement can fire continuously over empty space. Keep it off by
   * default; pointer-driven navigation is still visible through focus logs.
   */
  readonly includePointerActivity?: boolean
}

export function installNavigationDiagnostics(
  bus: InputBus,
  options: NavigationDiagnosticsOptions = {},
): () => void {
  const log = options.log ?? ((fields, message) => logger.info(fields, message))
  const includePointerActivity = options.includePointerActivity ?? false

  const unsubscribeAction = bus.on(action => {
    if (action.type === "pointer-activity" && !includePointerActivity) return

    log(describeAction(action), "navigation: input action")
  })

  const target =
    options.target ?? (typeof document !== "undefined" ? document : undefined)

  const onFocusIn = (event: Event) => {
    const focused = asHTMLElement(event.target)
    if (!focused) return

    log(
      {
        event: "focus",
        target: describeFocusTarget(focused),
      },
      "navigation: focus changed",
    )
  }

  target?.addEventListener("focusin", onFocusIn)

  return () => {
    unsubscribeAction()
    target?.removeEventListener("focusin", onFocusIn)
  }
}

function describeAction(
  action: InputAction,
): Readonly<Record<string, unknown>> {
  const base: Record<string, unknown> = {
    event: "input-action",
    action: action.type,
    source: action.source ?? "synthetic",
  }

  if (action.type === "direction") {
    base.direction = action.direction
  }

  return base
}

function describeFocusTarget(
  element: HTMLElement,
): Readonly<Record<string, unknown>> {
  return omitUndefined({
    tag: element.tagName.toLowerCase(),
    id: element.id || undefined,
    role: element.getAttribute("role") ?? undefined,
    ariaLabel: element.getAttribute("aria-label") ?? undefined,
    tileId: element.dataset.tileId || undefined,
    text: summarizeText(element.textContent),
  })
}

function summarizeText(text: string | null): string | undefined {
  const normalized = text?.replace(/\s+/g, " ").trim()
  if (!normalized) return undefined
  return normalized.length > 80 ? `${normalized.slice(0, 77)}…` : normalized
}

function omitUndefined(
  value: Record<string, unknown>,
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  )
}

function asHTMLElement(value: EventTarget | null): HTMLElement | null {
  if (typeof HTMLElement === "undefined") return null
  return value instanceof HTMLElement ? value : null
}
