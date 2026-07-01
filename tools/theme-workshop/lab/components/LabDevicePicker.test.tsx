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
  it("selects one device from all", () => {
    const { setDevicesSegment } = renderPicker({ selection: { kind: "all" } })

    fireEvent.change(screen.getByLabelText("Device selection"), {
      target: { value: "rg353m" },
    })

    expect(setDevicesSegment).toHaveBeenCalledWith("rg353m")
  })

  it("switches explicitly back to all", () => {
    const { setDevicesSegment } = renderPicker({
      selection: { kind: "set", ids: ["rg353m"] },
      selectedDevices: [rg353m],
    })

    fireEvent.change(screen.getByLabelText("Device selection"), {
      target: { value: "all" },
    })

    expect(setDevicesSegment).toHaveBeenCalledWith("all")
  })

  it("shows an existing multi-device URL segment as the current value", () => {
    renderPicker({
      selection: { kind: "set", ids: ["rg353m", "odin2portal"] },
    })

    const select = screen.getByLabelText("Device selection")
    expect(select).toBeInstanceOf(HTMLSelectElement)
    expect((select as HTMLSelectElement).value).toBe("rg353m,odin2portal")
    const option = screen.getByRole("option", { name: "2 devices" })
    expect(option).toBeInstanceOf(HTMLOptionElement)
    expect((option as HTMLOptionElement).value).toBe("rg353m,odin2portal")
  })
})
