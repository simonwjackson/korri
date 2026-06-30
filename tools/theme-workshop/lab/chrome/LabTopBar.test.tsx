import { afterEach, describe, expect, it } from "bun:test"
import { cleanup, render, screen } from "@testing-library/react"
import { LabContext, type LabContextValue } from "../Lab.context"
import type { LabSurfaceAdapter } from "../surface-registry"
import { LabTopBar } from "./LabTopBar"

afterEach(() => cleanup())

const adapter: LabSurfaceAdapter = {
  id: "shift",
  devices: [],
  screens: [{ label: "Home", path: "/" }],
  makeSeedInitialValues: async () => ({}),
  mountSurface: () => ({ router: {}, dispose: () => {} }),
}

function context(): LabContextValue {
  return {
    adapter,
    initialValues: {},
    themeId: "shift",
    surfacePath: "/",
    initialCanvasView: "device",
    screens: adapter.screens ?? [],
    selection: { kind: "all" },
    devices: [],
    selectedDevices: [],
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

function renderBar() {
  render(
    <LabContext.Provider value={context()}>
      <LabTopBar
        chromeMode="dock"
        onChromeModeChange={() => {}}
        onHideChrome={() => {}}
        onOpenSettings={() => {}}
        compact={false}
      />
    </LabContext.Provider>,
  )
}

describe("LabTopBar", () => {
  it("does not render the Inspect/Live toggle", () => {
    renderBar()

    expect(screen.queryByRole("button", { name: "Inspect" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Live" })).toBeNull()
  })

  it("does not render the legacy Screen dropdown", () => {
    renderBar()
    expect(screen.queryByLabelText("Screen")).toBeNull()
  })
})
