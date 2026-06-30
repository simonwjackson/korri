/**
 * How the lab's chrome is laid out. One adaptive model, two positions — the
 * same panels and controls reflow into each. Workspace is the full surface
 * (free placement plus edge-dock wells); Overlay is the compact/touch form.
 * The default is derived from the viewport (narrow → overlay, wide →
 * workspace); the user can override it.
 */
export type LabPresentation = "workspace" | "overlay"

const STORAGE_KEY = "lab-presentation"
export const NARROW_QUERY = "(max-width: 760px), (pointer: coarse)"

export function readStoredPresentation(): LabPresentation | null {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem(STORAGE_KEY)
  return raw === "workspace" || raw === "overlay" ? raw : null
}

export function persistPresentation(presentation: LabPresentation): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, presentation)
  } catch {
    // Ignore storage failures (private mode/quota); the choice just won't persist.
  }
}

export function viewportPresentation(): LabPresentation {
  if (typeof window === "undefined") return "workspace"
  return window.matchMedia?.(NARROW_QUERY)?.matches ? "overlay" : "workspace"
}
