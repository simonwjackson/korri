import { type CSSProperties, useEffect, useState } from "react"
import { resolveClassNames } from "../../classnames"
import { DeviceFrame } from "../../device-lab"
import { Parts } from "../../Parts"
import { useLab } from "../Lab.context"
import { LabSurfaceMount } from "../LabSurfaceMount"
import { loadSurfaceParts, type LabPartsCatalog } from "../parts-discovery"

const VIEWPORT_INSET = 48

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
        {selectedDevices.map(device => (
          <div key={device.id} data-lab-device-id={device.id}>
            <DeviceFrame
              widthMm={device.widthMm}
              heightMm={device.heightMm}
              pxPerMm={pxPerMm}
              maxHeightPx={maxHeightPx}
              bezel={device.bezel}
            >
              <LabSurfaceMount
                adapter={adapter}
                initialValues={initialValues}
                surfacePath={surfacePath}
                onNavigate={setSurfacePath}
              />
            </DeviceFrame>
          </div>
        ))}
      </div>
    </div>
  )
}
