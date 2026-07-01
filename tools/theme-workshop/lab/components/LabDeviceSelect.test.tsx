import { describe, expect, it, mock } from "bun:test"
import { fireEvent, render, screen } from "@testing-library/react"
import type { DeviceConfig } from "../../device-lab"
import { LabContext, type LabContextValue } from "../Lab.context"
import type { LabSurfaceAdapter } from "../surface-registry"
import { LabDeviceSelect } from "./LabDeviceSelect"

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

const adapter: LabSurfaceAdapter = {
  id: "test",
  devices,
  makeSeedInitialValues: async () => ({}),
  mountSurface: () => ({ router: {} as never, dispose: () => undefined }),
}

function renderSelect(
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
      <LabDeviceSelect />
    </LabContext.Provider>,
  )
  return { setDevicesSegment }
}

describe("LabDeviceSelect", () => {
  it("renders device selection as a dropdown", () => {
    renderSelect({ selection: { kind: "all" } })

    expect(screen.getByRole("combobox", { name: "Device selection" })).toBe(
      screen.getByLabelText("Device selection"),
    )
    expect(
      screen.queryByRole("toolbar", { name: "Device selection" }),
    ).toBeNull()
  })

  it("selects one device from the dropdown", () => {
    const { setDevicesSegment } = renderSelect({ selection: { kind: "all" } })

    fireEvent.change(screen.getByLabelText("Device selection"), {
      target: { value: "odin2portal" },
    })

    expect(setDevicesSegment).toHaveBeenCalledWith("odin2portal")
  })
})
