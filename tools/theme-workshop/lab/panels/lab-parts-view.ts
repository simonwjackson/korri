/** Which Parts-panel presentation is active: visual cards or a compact list. */
export type LabPartsView = "visual" | "list"

const STORAGE_KEY = "lab-parts-view"

export function readStoredPartsView(): LabPartsView {
  if (typeof window === "undefined") return "visual"
  return window.localStorage.getItem(STORAGE_KEY) === "list" ? "list" : "visual"
}

export function persistPartsView(view: LabPartsView): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, view)
  } catch {
    // Ignore storage failures (private mode/quota); the choice just won't persist.
  }
}
