import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import type { WorkshopControl } from "../../types"
import { LabContext, type LabContextValue } from "../Lab.context"
import type { LabSurfaceAdapter } from "../surface-registry"
import { LabSurfaceControls } from "./LabSurfaceControls"

function contextFor(adapter: LabSurfaceAdapter): LabContextValue {
  return {
    adapter,
    initialValues: {},
    themeId: adapter.id,
    surfacePath: "/",
    initialCanvasView: "device",
    screens: [],
    selection: { kind: "all" },
    devices: [],
    selectedDevices: [],
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
}

afterEach(() => cleanup())

function renderWith(adapter: LabSurfaceAdapter) {
  const value: LabContextValue = {
    adapter,
    initialValues: {},
    themeId: adapter.id,
    surfacePath: "/",
    initialCanvasView: "device",
    screens: [],
    selection: { kind: "all" },
    devices: [],
    selectedDevices: [],
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

  it("survives a surface switch between hooks of different lengths", () => {
    // shift-like adapter: its controls hook calls ONE hook.
    const shiftControls = (): readonly WorkshopControl[] => {
      useState("x")
      return [
        {
          kind: "cycle",
          id: "k",
          label: "SHIFT",
          value: "1",
          onClick: () => undefined,
        },
      ]
    }
    // pico-like adapter: its controls hook calls THREE hooks.
    const picoControls = (): readonly WorkshopControl[] => {
      useState(1)
      useState(2)
      useState(3)
      return [
        {
          kind: "cycle",
          id: "k",
          label: "PICO",
          value: "3",
          onClick: () => undefined,
        },
      ]
    }
    const tree = (adapter: LabSurfaceAdapter) => (
      <LabContext.Provider value={contextFor(adapter)}>
        <LabSurfaceControls />
      </LabContext.Provider>
    )

    const { rerender } = render(
      tree({ ...baseAdapter, id: "shift", useControls: shiftControls }),
    )
    expect(screen.getByText("SHIFT")).toBeTruthy()

    // Without the per-surface remount key this rerender throws
    // "rendered more hooks than during the previous render".
    rerender(tree({ ...baseAdapter, id: "pico", useControls: picoControls }))
    expect(screen.getByText("PICO")).toBeTruthy()
  })
})
