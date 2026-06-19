/**
 * theme-workshop — class-name resolution.
 *
 * Merges a theme's optional `classNames` over the kit's neutral `wk-*` defaults
 * so every chrome element always has a class. A theme that supplies its own
 * names keeps full styling control (its CSS applies, the neutral default is not
 * emitted), which is how pico keeps its look without the kit shipping pico CSS.
 */
import type { WorkshopClassNames } from "./types"

export type ResolvedClassNames = Required<WorkshopClassNames>

const NEUTRAL: ResolvedClassNames = {
  stage: "wk-stage",
  screens: "wk-screens",
  bezel: "wk-bezel",
  screen: "wk-screen",
  bar: "wk-bar",
  label: "wk-bar-label",
  count: "wk-bar-count",
  view: "wk-bar-view",
  mapToggle: "wk-bar-map",
  mapPanel: "wk-map",
  mapHead: "wk-map-head",
  mapBody: "wk-map-body",
  mapGroup: "wk-map-group",
  mapGroupTitle: "wk-map-gtitle",
  mapItem: "wk-map-item",
  wall: "wk-wall",
  wallGroup: "wk-wall-group",
  wallGroupTitle: "wk-wall-gtitle",
  wallGroupCount: "wk-wall-gcount",
  wallGrid: "wk-wall-grid",
  wallCell: "wk-wall-cell",
  wallFrame: "wk-wall-frame",
  wallScreen: "wk-wall-screen",
  wallHit: "wk-wall-hit",
  wallLabel: "wk-wall-label",
}

export function resolveClassNames(
  overrides: WorkshopClassNames = {},
): ResolvedClassNames {
  const out = { ...NEUTRAL }
  for (const key of Object.keys(NEUTRAL) as (keyof ResolvedClassNames)[]) {
    const value = overrides[key]
    if (typeof value === "string" && value.length > 0) out[key] = value
  }
  return out
}

/** Join truthy class fragments. */
export const cx = (...classes: readonly (string | false | undefined)[]) =>
  classes.filter(Boolean).join(" ")
