import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { LabContext, type LabContextValue } from "../Lab.context"
import { __setPartModulesForTest } from "../parts-discovery"
import type { LabSurfaceAdapter } from "../surface-registry"
import { LabRouteBar } from "./LabRouteBar"

afterEach(() => {
  __setPartModulesForTest(null)
  cleanup()
})

const adapter: LabSurfaceAdapter = {
  id: "test",
  devices: [],
  screens: [
    { label: "Home", path: "/" },
    { label: "Game Detail", path: "/game/hollow-knight" },
  ],
  makeSeedInitialValues: async () => ({}),
  mountSurface: () => ({ router: {} as never, dispose: () => undefined }),
}

function renderBar(surfacePath: string) {
  const setSurfacePath = mock(() => undefined)
  const value: LabContextValue = {
    adapter,
    initialValues: {},
    themeId: "test",
    surfacePath,
    screens: adapter.screens ?? [],
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
    setSurfacePath,
  }
  render(
    <LabContext.Provider value={value}>
      <LabRouteBar />
    </LabContext.Provider>,
  )
  return { setSurfacePath }
}

describe("LabRouteBar surface switcher", () => {
  it("marks the active screen from the current surface path", () => {
    renderBar("/game/hollow-knight")

    expect(
      screen
        .getByRole("tab", { name: "Game Detail" })
        .getAttribute("aria-selected"),
    ).toBe("true")
    expect(
      screen.getByRole("tab", { name: "Home" }).getAttribute("aria-selected"),
    ).toBe("false")
  })

  it("navigates the surface route when a screen is chosen", () => {
    const { setSurfacePath } = renderBar("/")

    fireEvent.click(screen.getByRole("tab", { name: "Game Detail" }))

    expect(setSurfacePath).toHaveBeenCalledWith("/game/hollow-knight")
  })

  it("adds Parts when the current surface has discovered parts", () => {
    __setPartModulesForTest({
      "/product/surfaces/web/test/ui/Test.atom.part.tsx": {
        default: () => "test part",
      },
    })
    const { setSurfacePath } = renderBar("/")

    fireEvent.click(screen.getByRole("tab", { name: "Parts" }))

    expect(setSurfacePath).toHaveBeenCalledWith("/parts")
  })
})
