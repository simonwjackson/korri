import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
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
    initialCanvasView: "surface",
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

function renderBar(
  inspectLive: "inspect" | "live" | null,
  onToggle = mock(() => undefined),
) {
  render(
    <LabContext.Provider value={context()}>
      <LabTopBar
        chromeMode="dock"
        onChromeModeChange={() => {}}
        onHideChrome={() => {}}
        compact={false}
        inspectLive={inspectLive}
        onToggleInspectLive={onToggle}
      />
    </LabContext.Provider>,
  )
  return onToggle
}

describe("LabTopBar Inspect/Live control", () => {
  it("shows the headline toggle reflecting the current mode", () => {
    renderBar("inspect")
    expect(
      screen
        .getByRole("button", { name: "Inspect" })
        .getAttribute("aria-pressed"),
    ).toBe("true")
    expect(
      screen.getByRole("button", { name: "Live" }).getAttribute("aria-pressed"),
    ).toBe("false")
  })

  it("toggles when the inactive side is clicked", () => {
    const onToggle = renderBar("inspect")
    fireEvent.click(screen.getByRole("button", { name: "Live" }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it("does not toggle when the active side is clicked", () => {
    const onToggle = renderBar("live")
    fireEvent.click(screen.getByRole("button", { name: "Live" }))
    expect(onToggle).not.toHaveBeenCalled()
  })

  it("hides the toggle when the surface has no axes", () => {
    renderBar(null)
    expect(screen.queryByRole("button", { name: "Inspect" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Live" })).toBeNull()
  })

  it("does not render the legacy Screen dropdown", () => {
    renderBar("live")
    expect(screen.queryByLabelText("Screen")).toBeNull()
  })
})
