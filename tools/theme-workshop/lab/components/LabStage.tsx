import { type CSSProperties, useEffect, useState } from "react"
import { resolveClassNames } from "../../classnames"
import {
  clusterOuterHeightPx,
  DeviceFrame,
  deviceScreens,
} from "../../device-lab"
import { Parts } from "../../Parts"
import { useLab } from "../Lab.context"
import { LabSurfaceMount } from "../LabSurfaceMount"
import { loadSurfaceParts, type LabPartsCatalog } from "../parts-discovery"
import { LabScreenPlaceholder } from "./LabScreenPlaceholder"

const VIEWPORT_INSET = 48
/** Painted gap between the stacked screens of a multi-screen device (px). */
const SCREEN_GAP_PX = 10

export function LabStage() {
  const {
    adapter,
    initialValues,
    selectedDevices,
    surfacePath,
    setSurfacePath,
    pxPerMm,
    knobValues,
  } = useLab()
  const [maxHeightPx, setMaxHeightPx] = useState<number | undefined>(() =>
    typeof window === "undefined"
      ? undefined
      : window.innerHeight - VIEWPORT_INSET,
  )
  const [partsCatalog, setPartsCatalog] = useState<LabPartsCatalog | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    const update = () => setMaxHeightPx(window.innerHeight - VIEWPORT_INSET)
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  useEffect(() => {
    let cancelled = false
    setPartsCatalog(null)
    if (surfacePath !== "/parts") return

    void loadSurfaceParts(adapter.id).then(catalog => {
      if (!cancelled) setPartsCatalog(catalog)
    })

    return () => {
      cancelled = true
    }
  }, [adapter.id, surfacePath])

  const stageStyle = Object.fromEntries(
    (adapter.knobs ?? []).map(knob => {
      const value = knobValues[knob.cssVar] ?? knob.default
      return [
        knob.cssVar,
        knob.infinityAtMax && value >= knob.max
          ? "infinity"
          : `${value}${knob.unit ?? ""}`,
      ]
    }),
  ) as CSSProperties

  if (surfacePath === "/parts") {
    return (
      <div className="lab-stage" style={stageStyle}>
        {partsCatalog ? (
          partsCatalog.stories.length > 0 ? (
            <div {...partsCatalog.rootProps}>
              <Parts
                stories={partsCatalog.stories}
                cn={resolveClassNames(partsCatalog.classNames)}
              />
            </div>
          ) : (
            <div className="lab-screens">
              <div className="lab-empty-state">
                No parts discovered for <code>{adapter.id}</code>. Add files
                like <code>Component.atom.part.tsx</code> under{" "}
                <code>product/surfaces/web/{adapter.id}/</code>.
              </div>
            </div>
          )
        ) : (
          <div className="lab-screens">Loading parts…</div>
        )}
      </div>
    )
  }

  return (
    <div className="lab-stage" style={stageStyle}>
      <div className="lab-screens">
        {selectedDevices.map(device => {
          const screens = deviceScreens(device)
          const primaryMount = (
            <LabSurfaceMount
              adapter={adapter}
              initialValues={initialValues}
              surfacePath={surfacePath}
              onNavigate={setSurfacePath}
            />
          )

          // Single-screen device: unchanged path (DeviceFrame fits itself).
          if (screens.length <= 1) {
            const screen = screens[0]
            return (
              <div key={device.id} data-lab-device-id={device.id}>
                <DeviceFrame
                  widthMm={screen.widthMm}
                  heightMm={screen.heightMm}
                  pxPerMm={pxPerMm}
                  maxHeightPx={maxHeightPx}
                  bezel={screen.bezel}
                >
                  {primaryMount}
                </DeviceFrame>
              </div>
            )
          }

          // Multi-screen device: stack screens and fit the whole cluster as a
          // unit (the inner frames stay at true px so container queries hold).
          const clusterTrueH = clusterOuterHeightPx(
            screens,
            pxPerMm,
            SCREEN_GAP_PX,
          )
          const clusterFit =
            maxHeightPx && clusterTrueH > maxHeightPx
              ? maxHeightPx / clusterTrueH
              : 1
          return (
            <div
              key={device.id}
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
                      primaryMount
                    )}
                  </DeviceFrame>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
