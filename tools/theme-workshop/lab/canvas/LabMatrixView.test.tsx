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
  kind: "single",
  label: "Data",
  liveLabel: "Auto",
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
  kind: "single",
  label: "Launch",
  liveLabel: "Auto",
  states: [
    { id: "Idle", label: "Idle" },
    { id: "Launching", label: "Launching" },
  ],
  pin: () => {},
  release: () => {},
  parent: { axisId: "data", whenStates: ["Ready"] },
  disabledHint: "Only while Data = Ready",
  renderSample: tag => <div data-testid={`launch-${tag}`}>launch {tag}</div>,
}

const overlaysAxis: LabStateAxis = {
  id: "overlays",
  kind: "multi",
  label: "Overlays",
  liveLabel: "Auto",
  states: [
    { id: "Notice", label: "Notice" },
    { id: "Toast", label: "Toast" },
  ],
  pin: () => {},
  release: () => {},
  renderSample: tag => <div data-testid={`overlays-${tag}`}>overlay {tag}</div>,
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

  it("collapses to a single axis when rows would duplicate the column", () => {
    renderMatrix([dataAxis, launchAxis])
    // Cross with Launch rows first.
    fireEvent.change(screen.getByDisplayValue("—"), {
      target: { value: "launch" },
    })
    expect(screen.getAllByTestId("launch-Launching").length).toBe(1)

    // Now set Columns to Launch too: must not produce a Launch×Launch grid that
    // greys every cell — it falls back to a single Launch fan.
    const colSelect = screen.getByDisplayValue("Data") as HTMLSelectElement
    fireEvent.change(colSelect, { target: { value: "launch" } })
    expect(screen.getByTestId("launch-Idle")).toBeTruthy()
    expect(screen.getByTestId("launch-Launching")).toBeTruthy()
    expect(screen.queryByText("Only while Data = Ready")).toBeNull()
  })

  it("excludes multi axes from row and column fan-out choices", () => {
    renderMatrix([dataAxis, launchAxis, overlaysAxis])
    expect(screen.queryByRole("option", { name: "Overlays" })).toBeNull()
    expect(screen.queryByTestId("overlays-Notice")).toBeNull()
  })

  it("offers no second axis to cross with when the screen has one single axis", () => {
    renderMatrix([dataAxis, overlaysAxis])
    expect(screen.getByTestId("data-Ready")).toBeTruthy()
    // The Rows selector only has the "none" option because the multi axis is not selectable.
    const rowSelect = screen.getByDisplayValue("—") as HTMLSelectElement
    expect(rowSelect.querySelectorAll("option").length).toBe(1)
  })
})
