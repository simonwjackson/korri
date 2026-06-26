import type { ReactNode } from "react"
import {
  clusterOuterHeightPx,
  DeviceFrame,
  type DeviceConfig,
  deviceScreens,
} from "../../device-lab"
import { LabScreenPlaceholder } from "./LabScreenPlaceholder"

/** Painted gap between the stacked screens of a multi-screen device (px). */
const SCREEN_GAP_PX = 10

/**
 * Render one device as its screen(s). A single-screen device is one DeviceFrame
 * (unchanged from the original path). A multi-screen device stacks its screens
 * top-to-bottom and scales the whole cluster to fit as a unit, with secondary
 * screens showing a placeholder until a real surface is assigned.
 *
 * `renderPrimary` supplies the primary screen's content (the surface mount), so
 * every lab view (surface, matrix, …) shares one multi-screen implementation
 * instead of re-deriving it — which is how the dual-screen render got lost in
 * the design-tool redesign.
 */
export function LabDeviceCluster({
  device,
  pxPerMm,
  maxHeightPx,
  renderPrimary,
}: {
  readonly device: DeviceConfig
  readonly pxPerMm: number
  readonly maxHeightPx?: number
  readonly renderPrimary: () => ReactNode
}) {
  const screens = deviceScreens(device)

  // Single-screen device: the frame fits itself (original behaviour).
  if (screens.length <= 1) {
    const screen = screens[0]
    return (
      <div data-lab-device-id={device.id}>
        <DeviceFrame
          widthMm={screen.widthMm}
          heightMm={screen.heightMm}
          pxPerMm={pxPerMm}
          maxHeightPx={maxHeightPx}
          bezel={screen.bezel}
        >
          {renderPrimary()}
        </DeviceFrame>
      </div>
    )
  }

  // Multi-screen device: stack screens and fit the cluster as a unit (the inner
  // frames stay at true px so container queries resolve as on the real panel).
  const clusterTrueH = clusterOuterHeightPx(screens, pxPerMm, SCREEN_GAP_PX)
  const clusterFit =
    maxHeightPx && clusterTrueH > maxHeightPx ? maxHeightPx / clusterTrueH : 1

  return (
    <div
      data-lab-device-id={device.id}
      className="lab-device-cluster"
      style={{
        gap: SCREEN_GAP_PX,
        transform: clusterFit < 1 ? `scale(${clusterFit})` : undefined,
        transformOrigin: "top center",
      }}
    >
      {screens.map(screen => (
        <div
          key={screen.id}
          data-lab-screen-id={screen.id}
          data-lab-screen-role={screen.role ?? "primary"}
        >
          <DeviceFrame
            widthMm={screen.widthMm}
            heightMm={screen.heightMm}
            pxPerMm={pxPerMm}
            bezel={screen.bezel}
          >
            {screen.role === "secondary" ? (
              <LabScreenPlaceholder label={screen.label ?? "Screen"} />
            ) : (
              renderPrimary()
            )}
          </DeviceFrame>
        </div>
      ))}
    </div>
  )
}
