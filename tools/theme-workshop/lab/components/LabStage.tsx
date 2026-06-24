import { type CSSProperties, useEffect, useState } from "react"
import { DeviceFrame } from "../../device-lab"
import { LabSurfaceMount } from "../LabSurfaceMount"
import { useLab } from "../Lab.context"

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

  useEffect(() => {
    if (typeof window === "undefined") return
    const update = () => setMaxHeightPx(window.innerHeight - VIEWPORT_INSET)
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  const stageStyle = Object.fromEntries(
    (adapter.knobs ?? []).map(knob => [
      knob.cssVar,
      `${knobValues[knob.cssVar] ?? knob.default}${knob.unit ?? ""}`,
    ]),
  ) as CSSProperties

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
