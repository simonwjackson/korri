export const UI_SCALE_CSS_VARIABLE = "--ui-scale"
export const DEFAULT_UI_SCALE = 1
export const MIN_UI_SCALE = 0.75
export const MAX_UI_SCALE = 1.5
export const UI_SCALE_STEP = 0.05

export function clampUiScale(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_UI_SCALE
  return roundUiScale(Math.min(MAX_UI_SCALE, Math.max(MIN_UI_SCALE, value)))
}

export function parseUiScale(value: string | number | null | undefined): number {
  if (typeof value === "number") return clampUiScale(value)
  if (typeof value !== "string") return DEFAULT_UI_SCALE

  const parsed = Number.parseFloat(value)
  return clampUiScale(parsed)
}

export function formatUiScalePercent(value: number): string {
  return `${Math.round(clampUiScale(value) * 100)}%`
}

export function serializeUiScale(value: number): string {
  return String(clampUiScale(value))
}

function roundUiScale(value: number): number {
  return Math.round(value * 100) / 100
}
