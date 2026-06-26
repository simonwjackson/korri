import type { ReactNode } from "react"
import {
  clusterBoundingHeightPx,
  DeviceFrame,
  type DeviceConfig,
  deviceScreens,
  groupScreensByPlacement,
  type ScreenConfig,
} from "../../device-lab"
import { LabScreenPlaceholder } from "./LabScreenPlaceholder"

/** Painted gap between a device's primary screen and its neighbours (px). */
const SCREEN_GAP_PX = 10

/**
 * Render one device as its screen(s). A single-screen device is one DeviceFrame
 * (unchanged from the original path). A multi-screen device lays its screens
 * out around the primary by placement (above/below/left/right) and scales the
 * whole cluster to fit as a unit; secondary screens show a placeholder until a
 * real surface is assigned.
 *
 * `renderPrimary` supplies the primary screen's content (the surface mount), so
 * every lab view shares one multi-screen implementation instead of re-deriving
 * it — which is how the dual-screen render got lost in the design-tool redesign.
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

  const { primary, above, below, left, right } =
    groupScreensByPlacement(screens)
  const clusterTrueH = clusterBoundingHeightPx(screens, pxPerMm, SCREEN_GAP_PX)
  const clusterFit =
    maxHeightPx && clusterTrueH > maxHeightPx ? maxHeightPx / clusterTrueH : 1

  const frame = (screen: ScreenConfig, content: ReactNode) => (
    <div
      key={screen.id}
      data-lab-screen-id={screen.id}
      data-lab-screen-role={screen.role ?? "primary"}
      data-lab-screen-placement={screen.placement}
    >
      <DeviceFrame
        widthMm={screen.widthMm}
        heightMm={screen.heightMm}
        pxPerMm={pxPerMm}
        bezel={screen.bezel}
      >
        {content}
      </DeviceFrame>
    </div>
  )

  const side = (list: readonly ScreenConfig[], area: string) =>
    list.length > 0 ? (
      <div className="lab-cluster-side" style={{ gridArea: area }}>
        {list.map(screen =>
          frame(
            screen,
            <LabScreenPlaceholder label={screen.label ?? "Screen"} />,
          ),
        )}
      </div>
    ) : null

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
      {side(above, "above")}
      {side(left, "left")}
      <div className="lab-cluster-primary" style={{ gridArea: "primary" }}>
        {frame(primary, renderPrimary())}
      </div>
      {side(right, "right")}
      {side(below, "below")}
    </div>
  )
}
