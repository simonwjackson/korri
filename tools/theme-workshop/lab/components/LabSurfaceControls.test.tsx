import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { WorkshopControl } from "../../types"
import { LabContext, type LabContextValue } from "../Lab.context"
import type { LabSurfaceAdapter } from "../surface-registry"
import { LabSurfaceControls } from "./LabSurfaceControls"

afterEach(() => cleanup())

function renderWith(adapter: LabSurfaceAdapter) {
  const value: LabContextValue = {
    adapter,
    initialValues: {},
    themeId: adapter.id,
    surfacePath: "/",
    screens: [],
    selection: { kind: "all" },
    devices: [],
    selectedDevices: [],
    pxPerMm: 3.7795275591,
    knobValues: {},
    setDevicesSegment: mock(() => undefined),
    setThemeId: mock(() => undefined),
    setSurfacePath: mock(() => undefined),
  }
  render(
    <LabContext.Provider value={value}>
      <LabSurfaceControls />
    </LabContext.Provider>,
  )
}

const baseAdapter: LabSurfaceAdapter = {
  id: "test",
  devices: [],
  makeSeedInitialValues: async () => ({}),
  mountSurface: () => ({ router: {} as never, dispose: () => undefined }),
}

describe("LabSurfaceControls", () => {
  it("renders nothing when the surface declares no controls", () => {
    renderWith(baseAdapter)
    expect(screen.queryByLabelText("Surface-specific controls")).toBeNull()
  })

  it("renders and drives the surface's declared controls", () => {
    const onClick = mock(() => undefined)
    const useControls = (): readonly WorkshopControl[] => [
      { kind: "cycle", id: "granularity", value: "72px", onClick },
    ]
    renderWith({ ...baseAdapter, useControls })

    const button = screen.getByRole("button", { name: "granularity" })
    expect(button.textContent).toContain("72px")
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
