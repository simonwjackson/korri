import type { DeviceConfig, ScreenConfig, ScreenPlacement } from "./types"

/**
 * Normalize a device to its list of screens. A single-screen device (no
 * `screens`) yields one "primary" screen built from its width/height, so the
 * rest of the lab can treat every device uniformly as a screen cluster.
 */
export function deviceScreens(device: DeviceConfig): readonly ScreenConfig[] {
  if (device.screens && device.screens.length > 0) return device.screens
  return [
    {
      id: device.id,
      widthMm: device.widthMm,
      heightMm: device.heightMm,
      bezel: device.bezel,
      role: "primary",
    },
  ]
}

/** Default side for a secondary screen with no explicit placement. */
const DEFAULT_PLACEMENT: ScreenPlacement = "below"

export type PlacedScreens = {
  readonly primary: ScreenConfig
  readonly above: readonly ScreenConfig[]
  readonly below: readonly ScreenConfig[]
  readonly left: readonly ScreenConfig[]
  readonly right: readonly ScreenConfig[]
}

/**
 * Split a device's screens into the primary (anchor) plus the secondary screens
 * grouped by the side they sit on. The primary is the first `role: "primary"`
 * screen (or the first screen); every other screen falls into its placement
 * bucket, defaulting to "below". Same-side screens keep declaration order.
 */
export function groupScreensByPlacement(
  screens: readonly ScreenConfig[],
): PlacedScreens {
  const primary =
    screens.find(screen => screen.role === "primary") ?? screens[0]
  const sides: Record<ScreenPlacement, ScreenConfig[]> = {
    above: [],
    below: [],
    left: [],
    right: [],
  }
  for (const screen of screens) {
    if (screen === primary) continue
    sides[screen.placement ?? DEFAULT_PLACEMENT].push(screen)
  }
  return { primary, ...sides }
}

const screenOuterHeightPx = (screen: ScreenConfig, pxPerMm: number): number => {
  const heightPx = Math.round(screen.heightMm * pxPerMm)
  const pad = screen.bezel === false ? 0 : Math.round(heightPx * 0.037)
  return heightPx + pad * 2
}

/**
 * Painted bounding height (px) of a placed screen cluster at a given pxPerMm.
 * Above/below stacks add to the primary's height; left/right screens only
 * widen the middle row, so their height competes with the primary's rather
 * than adding to it. Used to scale a multi-screen device to fit the viewport.
 */
export function clusterBoundingHeightPx(
  screens: readonly ScreenConfig[],
  pxPerMm: number,
  gapPx = 0,
): number {
  const { primary, above, below, left, right } =
    groupScreensByPlacement(screens)
  const stack = (list: readonly ScreenConfig[]) =>
    list.reduce(
      (total, s) => total + screenOuterHeightPx(s, pxPerMm) + gapPx,
      0,
    )
  const middleRow = Math.max(
    screenOuterHeightPx(primary, pxPerMm),
    ...left.map(s => screenOuterHeightPx(s, pxPerMm)),
    ...right.map(s => screenOuterHeightPx(s, pxPerMm)),
  )
  return stack(above) + middleRow + stack(below)
}
