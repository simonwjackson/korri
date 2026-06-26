import { afterEach, describe, expect, it } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { DeviceConfig } from "../../device-lab"
import { LabContext, type LabContextValue } from "../Lab.context"
import type { LabStateAxis } from "../model/lab-state-axis"
import type { LabSurfaceAdapter } from "../surface-registry"
import { LabMatrixView } from "./LabMatrixView"

afterEach(() => cleanup())

const device: DeviceConfig = {
  id: "rg353m",
  name: "RG353M",
  widthMm: 72,
  heightMm: 52,
}

const adapter: LabSurfaceAdapter = {
  id: "test",
  devices: [device],
  makeSeedInitialValues: async () => ({}),
  mountSurface: () => ({ router: {}, dispose: () => {} }),
}

function context(): LabContextValue {
  return {
    adapter,
    initialValues: {},
    themeId: "test",
    surfacePath: "/",
    initialCanvasView: "matrix",
    screens: [],
    selection: { kind: "all" },
    devices: [device],
    selectedDevices: [device],
    pxPerMm: 4,
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
    setDevicesSegment: () => {},
    setThemeId: () => {},
    setSurfacePath: () => {},
  }
}

const dataAxis: LabStateAxis = {
  id: "data",
  label: "Data",
  liveLabel: "Live",
  states: [
    { id: "Loading", label: "Loading" },
    { id: "Ready", label: "Ready" },
    { id: "Empty", label: "Empty" },
  ],
  pin: () => {},
  release: () => {},
  renderSample: tag => <div data-testid={`data-${tag}`}>data {tag}</div>,
}

const launchAxis: LabStateAxis = {
  id: "launch",
  label: "Launch",
  liveLabel: "Live",
  states: [
    { id: "Idle", label: "Idle" },
    { id: "Launching", label: "Launching" },
  ],
  pin: () => {},
  release: () => {},
  enabledWhen: active => active.data === "Ready",
  disabledHint: "Only while Data = Ready",
  renderSample: tag => <div data-testid={`launch-${tag}`}>launch {tag}</div>,
}

function renderMatrix(axes: readonly LabStateAxis[]) {
  return render(
    <LabContext.Provider value={context()}>
      <LabMatrixView
        selectedStories={[]}
        stories={new Map()}
        sources={[]}
        states={[]}
        devices={[device]}
        axes={axes}
      />
    </LabContext.Provider>,
  )
}

describe("LabMatrixView axis fan-out", () => {
  it("fans one cell per value of the chosen axis (single axis by default)", () => {
    renderMatrix([dataAxis, launchAxis])
    expect(screen.getByTestId("data-Loading")).toBeTruthy()
    expect(screen.getByTestId("data-Ready")).toBeTruthy()
    expect(screen.getByTestId("data-Empty")).toBeTruthy()
    // Single-axis: the dependent launch sample is not rendered yet.
    expect(screen.queryByTestId("launch-Launching")).toBeNull()
  })

  it("renders the cross-product and marks nested cells not-applicable", () => {
    renderMatrix([dataAxis, launchAxis])
    // Add the Launch axis as rows for the cross-product.
    fireEvent.change(screen.getByDisplayValue("—"), {
      target: { value: "launch" },
    })

    // Launch sample renders only in the Data=Ready column.
    expect(screen.getAllByTestId("launch-Launching").length).toBe(1)
    // Data=Loading / Data=Empty columns are not-applicable for Launch.
    expect(
      screen.getAllByText("Only while Data = Ready").length,
    ).toBeGreaterThan(0)
  })

  it("offers no second axis to cross with when the screen has one axis", () => {
    renderMatrix([dataAxis])
    expect(screen.getByTestId("data-Ready")).toBeTruthy()
    // The Rows selector only has the "none" option.
    const rowSelect = screen.getByDisplayValue("—") as HTMLSelectElement
    expect(rowSelect.querySelectorAll("option").length).toBe(1)
  })
})
