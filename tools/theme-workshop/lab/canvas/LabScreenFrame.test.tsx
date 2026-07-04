import { afterEach, describe, expect, it } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { DeviceConfig } from "../../device-lab"
import { LabContext, type LabContextValue } from "../Lab.context"
import type { LabCalibrationController } from "../model/lab-calibration-state"
import { resetPreviewFrameForTest } from "../model/lab-preview-frame"
import type { LabSurfaceAdapter } from "../surface-registry"
import { LabScreenFrame } from "./LabScreenFrame"

afterEach(() => {
  cleanup()
  resetPreviewFrameForTest()
})

const devices: readonly DeviceConfig[] = [
  { id: "rg353m", name: "RG353M", widthMm: 72, heightMm: 52 },
  { id: "tv65", name: '65" TV', widthMm: 1439, heightMm: 809, bezel: false },
]

const adapter: LabSurfaceAdapter = {
  id: "test",
  devices,
  makeSeedInitialValues: async () => ({}),
  mountSurface: () => ({ router: {}, dispose: () => undefined }),
}

const calibration: LabCalibrationController = {
  setPxPerMm: () => undefined,
  patchDevice: () => undefined,
  addDevice: () => undefined,
  removeDevice: () => undefined,
  setKnob: () => undefined,
  reset: () => undefined,
  storageKey: "test",
}

const context: LabContextValue = {
  adapter,
  initialValues: {},
  themeId: "test",
  surfacePath: "/",
  screens: [],
  selection: { kind: "set", ids: [] },
  devices,
  selectedDevices: [],
  pxPerMm: 1,
  knobValues: {},
  calibration,
  setDevicesSegment: () => undefined,
  setThemeId: () => undefined,
  setSurfacePath: () => undefined,
}

const renderFrame = () =>
  render(
    <LabContext.Provider value={context}>
      <LabScreenFrame screen={{ id: "s", widthMm: 100, heightMm: 100 }}>
        <div>part body</div>
      </LabScreenFrame>
    </LabContext.Provider>,
  )

const frameEl = () =>
  document.querySelector<HTMLElement>(".lab-compose-screen-frame")

// happy-dom normalises `aspect-ratio` to an `a / b` string; read it back as a
// number so the assertion is independent of that formatting.
const frameRatio = (): number => {
  const raw = frameEl()?.style.aspectRatio ?? ""
  const [a, b] = raw.split("/").map(part => Number(part.trim()))
  return b ? a / b : a
}

describe("LabScreenFrame preview sizing", () => {
  it("lists every device size to switch between, plus Fit", () => {
    renderFrame()
    const select = screen.getByLabelText(
      "Preview frame device size",
    ) as HTMLSelectElement
    const labels = [...select.options].map(option => option.textContent)
    expect(labels[0]).toBe("Fit to screen")
    expect(labels).toContain("RG353M · 72×52mm")
    expect(labels).toContain('65" TV · 1439×809mm')
  })

  it("fits the part's own square screen aspect by default", () => {
    renderFrame()
    expect(frameRatio()).toBeCloseTo(1)
    expect(frameEl()?.style.width).toBe("520px")
  })

  it("takes the chosen device's aspect and a device-shaped width", () => {
    renderFrame()
    fireEvent.change(screen.getByLabelText("Preview frame device size"), {
      target: { value: "tv65" },
    })
    // 65" TV is wide (1439/809 ≈ 1.78), so the frame goes wide.
    expect(frameRatio()).toBeCloseTo(1439 / 809)
    expect(Number.parseInt(frameEl()?.style.width ?? "0", 10)).toBeGreaterThan(
      520,
    )
  })
})
