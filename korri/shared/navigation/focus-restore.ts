export interface FocusRestoreOptions {
  /** Scope focus capture/restore to a subtree. Defaults to document.body. */
  readonly scope?: () => HTMLElement | null | undefined
  /** Schedule restoration after DOM updates. Defaults to requestAnimationFrame. */
  readonly schedule?: (restore: () => void) => void
}

export interface FocusRestore {
  capture(scopeKey: string): void
  restore(scopeKey: string): void
  clear(): void
}

type FocusIdentity =
  | { readonly kind: "id"; readonly value: string }
  | { readonly kind: "aria-label"; readonly value: string }
  | { readonly kind: "path"; readonly value: string }

/**
 * Remembers focused DOM elements by route/scope key and restores them after
 * remounts. Components don't opt in: accessible identifiers (`id` and
 * `aria-label`) are used first, with a structural path fallback.
 */
export function createFocusRestore(
  options: FocusRestoreOptions = {},
): FocusRestore {
  const identities = new Map<string, FocusIdentity>()
  const schedule =
    options.schedule ??
    ((restore: () => void) => requestAnimationFrame(restore))

  const getScope = () => options.scope?.() ?? document.body

  return {
    capture(scopeKey) {
      const active = document.activeElement as HTMLElement | null
      const scope = getScope()
      if (!scope || !isMeaningfulFocusTarget(active) || !scope.contains(active))
        return

      const identity = getFocusIdentity(active, scope)
      if (identity) identities.set(scopeKey, identity)
    },
    restore(scopeKey) {
      const identity = identities.get(scopeKey)
      if (!identity) return

      schedule(() => {
        const scope = getScope()
        if (!scope) return
        const target = findByIdentity(identity, scope)
        target?.focus()
      })
    },
    clear() {
      identities.clear()
    },
  }
}

function getFocusIdentity(
  element: HTMLElement,
  scope: HTMLElement,
): FocusIdentity | null {
  if (element.id) return { kind: "id", value: element.id }

  const ariaLabel = element.getAttribute("aria-label")
  if (ariaLabel) return { kind: "aria-label", value: ariaLabel }

  const path = getStructuralPath(element, scope)
  return path ? { kind: "path", value: path } : null
}

function findByIdentity(
  identity: FocusIdentity,
  scope: HTMLElement,
): HTMLElement | null {
  switch (identity.kind) {
    case "id":
      return findElementByAttribute(scope, "id", identity.value)
    case "aria-label":
      return findElementByAttribute(scope, "aria-label", identity.value)
    case "path":
      return scope.querySelector<HTMLElement>(identity.value)
  }
}

function findElementByAttribute(
  scope: HTMLElement,
  attribute: "id" | "aria-label",
  value: string,
): HTMLElement | null {
  if (scope.getAttribute(attribute) === value) return scope

  for (const element of scope.querySelectorAll<HTMLElement>(`[${attribute}]`)) {
    if (element.getAttribute(attribute) === value) return element
  }

  return null
}

function getStructuralPath(
  element: HTMLElement,
  scope: HTMLElement,
): string | null {
  const segments: string[] = []
  let current: HTMLElement | null = element

  while (current && current !== scope) {
    const parent: HTMLElement | null = current.parentElement
    if (!parent) return null
    const currentTagName = current.tagName
    const tagName = currentTagName.toLowerCase()
    const siblings = [...parent.children].filter(
      child => child.tagName === currentTagName,
    )
    const index = siblings.indexOf(current) + 1
    segments.unshift(`${tagName}:nth-of-type(${index})`)
    current = parent
  }

  return segments.length > 0 ? segments.join(" > ") : null
}

function isMeaningfulFocusTarget(el: HTMLElement | null): el is HTMLElement {
  return !!el && el !== document.body && el !== document.documentElement
}
