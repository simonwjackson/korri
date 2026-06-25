import { type CSSProperties, useEffect, useState } from "react"
import { resolveClassNames } from "../../classnames"
import { DeviceFrame } from "../../device-lab"
import { Parts } from "../../Parts"
import { useLab } from "../Lab.context"
import { LabSurfaceMount } from "../LabSurfaceMount"
import type { LabSurfaceAtomicCatalog } from "../surface-registry"

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
  const [atomicCatalog, setAtomicCatalog] =
    useState<LabSurfaceAtomicCatalog | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    const update = () => setMaxHeightPx(window.innerHeight - VIEWPORT_INSET)
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  useEffect(() => {
    let cancelled = false
    setAtomicCatalog(null)
    if (surfacePath !== "/parts" || !adapter.loadAtomicCatalog) return

    void adapter.loadAtomicCatalog().then(catalog => {
      if (!cancelled) setAtomicCatalog(catalog)
    })

    return () => {
      cancelled = true
    }
  }, [adapter, surfacePath])

  const stageStyle = Object.fromEntries(
    (adapter.knobs ?? []).map(knob => [
      knob.cssVar,
      `${knobValues[knob.cssVar] ?? knob.default}${knob.unit ?? ""}`,
    ]),
  ) as CSSProperties

  if (surfacePath === "/parts" && adapter.loadAtomicCatalog) {
    return (
      <div className="lab-stage" style={stageStyle}>
        {atomicCatalog ? (
          <div {...atomicCatalog.rootProps}>
            <Parts
              stories={atomicCatalog.stories}
              cn={resolveClassNames(atomicCatalog.classNames)}
            />
          </div>
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
              textScale={device.textPct / 100}
              padScale={device.padPct / 100}
              scaleVarPrefix={adapter.scaleVarPrefix ?? "lab"}
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
