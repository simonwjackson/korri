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
  },
  {
    id: "odin2portal",
    name: "ODIN 2 PORTAL",
    widthMm: 156,
    heightMm: 85,
  },
]

const rg353m = devices[0]
if (!rg353m) throw new Error("expected RG353M fixture")

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
    screens: [],
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
  it("renders devices as a selectable list", () => {
    renderPicker({ selection: { kind: "all" } })

    expect(screen.getByRole("list", { name: "Live devices" })).toBeTruthy()
    expect(screen.queryByRole("combobox", { name: "Device selection" })).toBeNull()
    expect(
      screen.getByRole("button", { name: "RG353M" }).getAttribute("aria-pressed"),
    ).toBe("true")
    expect(
      screen
        .getByRole("button", { name: "ODIN 2 PORTAL" })
        .getAttribute("aria-pressed"),
    ).toBe("true")
  })

  it("can narrow from all devices by toggling one device off", () => {
    const { setDevicesSegment } = renderPicker({ selection: { kind: "all" } })

    fireEvent.click(screen.getByRole("button", { name: "RG353M" }))

    expect(setDevicesSegment).toHaveBeenCalledWith("odin2portal")
  })

  it("can remove the last selected device", () => {
    const { setDevicesSegment } = renderPicker({
      selection: { kind: "set", ids: ["rg353m"] },
      selectedDevices: [rg353m],
    })

    fireEvent.click(screen.getByRole("button", { name: "RG353M" }))

    expect(setDevicesSegment).toHaveBeenCalledWith("none")
  })

  it("collapses to all when the last missing device is toggled on", () => {
    const { setDevicesSegment } = renderPicker({
      selection: { kind: "set", ids: ["rg353m"] },
      selectedDevices: [rg353m],
    })

    fireEvent.click(screen.getByRole("button", { name: "ODIN 2 PORTAL" }))

    expect(setDevicesSegment).toHaveBeenCalledWith("all")
  })

  it("offers an explicit all-devices action", () => {
    const { setDevicesSegment } = renderPicker({
      selection: { kind: "set", ids: ["rg353m"] },
      selectedDevices: [rg353m],
    })

    fireEvent.click(screen.getByRole("button", { name: "All live devices" }))

    expect(setDevicesSegment).toHaveBeenCalledWith("all")
  })
})
