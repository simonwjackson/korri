import { describe, expect, it, mock } from "bun:test"
import { fireEvent, render, screen } from "@testing-library/react"
import type { DeviceConfig } from "../../device-lab"
import { LabContext, type LabContextValue } from "../Lab.context"
import type { LabSurfaceAdapter } from "../surface-registry"
import { LabDevicePicker } from "./LabDevicePicker"

const devices: readonly DeviceConfig[] = [
  {
    id: "rg353m",
    name: "RG353M",
    widthMm: 72,
    heightMm: 52,
    textPct: 100,
    padPct: 100,
  },
  {
    id: "odin2portal",
    name: "ODIN 2 PORTAL",
    widthMm: 156,
    heightMm: 85,
    textPct: 100,
    padPct: 100,
  },
]

const adapter: LabSurfaceAdapter = {
  id: "test",
  devices,
  makeSeedInitialValues: async () => ({}),
  mountSurface: () => ({ router: {} as never, dispose: () => undefined }),
}

function renderPicker(
  overrides: Partial<LabContextValue> & Pick<LabContextValue, "selection">,
) {
  const setDevicesSegment = mock(() => undefined)
  const value: LabContextValue = {
    adapter,
    initialValues: {},
    themeId: "test",
    surfacePath: "/",
    devices,
    selectedDevices: devices,
    pxPerMm: 3.7795275591,
    knobValues: {},
    setDevicesSegment,
    setThemeId: mock(() => undefined),
    setSurfacePath: mock(() => undefined),
    ...overrides,
  }
  render(
    <LabContext.Provider value={value}>
      <LabDevicePicker />
    </LabContext.Provider>,
  )
  return { setDevicesSegment }
}

describe("LabDevicePicker", () => {
  it("selects one device from all", () => {
    const { setDevicesSegment } = renderPicker({ selection: { kind: "all" } })

    fireEvent.click(screen.getByRole("button", { name: "RG353M" }))

    expect(setDevicesSegment).toHaveBeenCalledWith("rg353m")
  })

  it("adds a second device to the URL segment in roster order", () => {
    const { setDevicesSegment } = renderPicker({
      selection: { kind: "set", ids: ["rg353m"] },
    })

    fireEvent.click(screen.getByRole("button", { name: "ODIN 2 PORTAL" }))

    expect(setDevicesSegment).toHaveBeenCalledWith("rg353m,odin2portal")
  })

  it("coerces the last deselected device back to all", () => {
    const { setDevicesSegment } = renderPicker({
      selection: { kind: "set", ids: ["rg353m"] },
      selectedDevices: [devices[0]!],
    })

    fireEvent.click(screen.getByRole("button", { name: "RG353M" }))

    expect(setDevicesSegment).toHaveBeenCalledWith("all")
  })

  it("switches explicitly back to all", () => {
    const { setDevicesSegment } = renderPicker({
      selection: { kind: "set", ids: ["rg353m"] },
      selectedDevices: [devices[0]!],
    })

    fireEvent.click(screen.getByRole("button", { name: "ALL" }))

    expect(setDevicesSegment).toHaveBeenCalledWith("all")
  })
})
