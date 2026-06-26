import type { DeviceConfig, ScreenConfig } from "./types"

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

/**
 * True painted height (px) of a vertically-stacked screen cluster at a given
 * pxPerMm — each screen's screen height plus its bezel padding, plus the
 * inter-screen gaps. The lab uses this to scale a whole multi-screen device
 * down to fit the viewport as one unit (mirrors DeviceFrame's pad formula).
 */
export function clusterOuterHeightPx(
  screens: readonly ScreenConfig[],
  pxPerMm: number,
  gapPx = 0,
): number {
  return screens.reduce((total, screen, index) => {
    const heightPx = Math.round(screen.heightMm * pxPerMm)
    const pad = screen.bezel === false ? 0 : Math.round(heightPx * 0.037)
    return total + heightPx + pad * 2 + (index > 0 ? gapPx : 0)
  }, 0)
}
