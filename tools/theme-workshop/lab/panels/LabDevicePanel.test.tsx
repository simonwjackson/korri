import { describe, expect, it, mock } from "bun:test"
import { render, screen } from "@testing-library/react"
import type { DeviceConfig } from "../../device-lab"
import { LabContext, type LabContextValue } from "../Lab.context"
import type { LabSurfaceAdapter } from "../surface-registry"
import { LabDevicePanel } from "../panels/LabDevicePanel"

const devices: readonly DeviceConfig[] = [
  { id: "rg353m", name: "RG353M", widthMm: 72, heightMm: 52 },
  { id: "odin2portal", name: "ODIN 2 PORTAL", widthMm: 156, heightMm: 85 },
]

const adapter: LabSurfaceAdapter = {
  id: "test",
  devices,
  makeSeedInitialValues: async () => ({}),
  mountSurface: () => ({ router: {} as never, dispose: () => undefined }),
}

function renderPanel() {
  const value: LabContextValue = {
    adapter,
    initialValues: {},
    themeId: "test",
    surfacePath: "/",
    screens: [],
    selection: { kind: "all" },
    devices,
    selectedDevices: devices,
    pxPerMm: 3.7795275591,
    knobValues: {},
    calibration: {
      setPxPerMm: () => {},
      patchDevice: () => {},
      addDevice: () => {},
      removeDevice: () => {},
      setKnob: () => {},
      reset: () => {},
      storageKey: "test",
    },
    setDevicesSegment: mock(() => undefined),
    setThemeId: mock(() => undefined),
    setSurfacePath: mock(() => undefined),
  }
  render(
    <LabContext.Provider value={value}>
      <LabDevicePanel />
    </LabContext.Provider>,
  )
}

describe("LabDevicePanel", () => {
  it("lists live devices without owning the surface selector", () => {
    renderPanel()

    expect(screen.getByRole("list", { name: "Live devices" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "RG353M" })).toBeTruthy()
    expect(screen.queryByLabelText("Surface")).toBeNull()
  })
})
